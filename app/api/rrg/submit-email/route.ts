/**
 * POST /api/rrg/submit-email
 *
 * Webhook endpoint for Resend inbound email → automatic design submission.
 * Also acts as a catch-all forwarder for non-submit emails.
 *
 * Flow:
 *   1. Agent emails submit@realrealgenuine.com with image attachment
 *   2. Resend receives it, fires `email.received` webhook to this endpoint
 *   3. We fetch the email body + attachment via Resend API
 *   4. Parse metadata from subject/body, download image, create submission
 *
 * Catch-all forwarding:
 *   Emails to any address other than submit@realrealgenuine.com are
 *   forwarded to the FORWARD_EMAIL address (default: richard@entrepot.asia).
 *
 * Email format agents should use:
 *   To:      submit@realrealgenuine.com
 *   Subject: "RRG: {Title of Design}"
 *   Body:
 *     wallet: 0x...
 *     description: optional text
 *     brief: optional-brief-slug-or-id
 *   Attachment: JPEG or PNG image (max 5 MB)
 *
 * Also accepts direct JSON POST (secured via x-email-submit-secret header)
 * for testing and manual/scripted processing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, getCurrentBrief, RRG_BRAND_ID } from '@/lib/rrg/db';
import { uploadSubmissionFile, jpegStoragePath } from '@/lib/rrg/storage';
import { randomUUID } from 'crypto';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const RESEND_API = 'https://api.resend.com';
const SUBMIT_ADDRESS = 'submit@realrealgenuine.com';
const FORWARD_TO = process.env.FORWARD_EMAIL || 'richard@entrepot.asia';
const FORWARD_FROM = process.env.FROM_EMAIL || 'deliver@realrealgenuine.com';

// ── Image format detection ──────────────────────────────────────────────
function detectImageFormat(buf: Buffer): { ext: 'jpg' | 'png'; mimeType: string } | null {
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF)
    return { ext: 'jpg', mimeType: 'image/jpeg' };
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47)
    return { ext: 'png', mimeType: 'image/png' };
  return null;
}

// ── Image integrity check ───────────────────────────────────────────────
function isImageComplete(buf: Buffer): { ok: boolean; reason?: string } {
  if (buf.length < 100) return { ok: false, reason: 'Image too small to be valid' };
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    if (buf[buf.length - 2] !== 0xFF || buf[buf.length - 1] !== 0xD9)
      return { ok: false, reason: 'JPEG truncated — missing FFD9' };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const tail = buf.subarray(buf.length - 12);
    const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
    if (!tail.equals(iend))
      return { ok: false, reason: 'PNG truncated — missing IEND' };
  }
  return { ok: true };
}

// ── Parse structured email body ─────────────────────────────────────────
function parseEmailBody(body: string): {
  wallet?: string;
  description?: string;
  brief?: string;
} {
  const result: Record<string, string> = {};
  const lines = body.split(/\r?\n/);
  const descLines: string[] = [];
  let inDesc = false;

  for (const line of lines) {
    const walletMatch = line.match(/^wallet\s*[:=]\s*(0x[0-9a-fA-F]{40})/i);
    if (walletMatch) { result.wallet = walletMatch[1]; inDesc = false; continue; }

    const briefMatch = line.match(/^brief\s*[:=]\s*(.+)/i);
    if (briefMatch) { result.brief = briefMatch[1].trim(); inDesc = false; continue; }

    const descMatch = line.match(/^description\s*[:=]\s*(.+)/i);
    if (descMatch) { descLines.push(descMatch[1].trim()); inDesc = true; continue; }

    if (inDesc && line.trim()) { descLines.push(line.trim()); }
    else if (inDesc && !line.trim()) { inDesc = false; }
  }

  if (descLines.length) result.description = descLines.join(' ').slice(0, 280);
  return result;
}

// ── Extract title from subject ──────────────────────────────────────────
function parseTitleFromSubject(subject: string): string | null {
  const match = subject.match(/^(?:RRG|RRG Submission)\s*[:—–-]\s*(.+)/i);
  if (match) return match[1].trim().slice(0, 60);
  const cleaned = subject.replace(/^(?:Re|Fwd|Fw)\s*:\s*/gi, '').trim();
  return cleaned.slice(0, 60) || null;
}

// ── Resend webhook signature verification ───────────────────────────────
// Resend signs webhooks using Svix — verify with the webhook secret
function verifyResendWebhook(
  payload: string,
  headers: { svixId: string; svixTimestamp: string; svixSignature: string },
  secret: string
): boolean {
  try {
    // Resend/Svix secret is base64-encoded after "whsec_" prefix
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const toSign = `${headers.svixId}.${headers.svixTimestamp}.${payload}`;
    const expectedSig = crypto
      .createHmac('sha256', secretBytes)
      .update(toSign)
      .digest('base64');
    // svixSignature can contain multiple sigs separated by spaces: "v1,sig1 v1,sig2"
    const sigs = headers.svixSignature.split(' ');
    return sigs.some(s => {
      const sigValue = s.replace(/^v1,/, '');
      return sigValue === expectedSig;
    });
  } catch {
    return false;
  }
}

// ── Resend API helpers ──────────────────────────────────────────────────
const resendHeaders = () => ({
  Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
  'Content-Type': 'application/json',
});

async function getReceivedEmail(emailId: string) {
  const resp = await fetch(`${RESEND_API}/emails/receiving/${emailId}`, {
    headers: resendHeaders(),
  });
  if (!resp.ok) throw new Error(`Resend get email failed: ${resp.status}`);
  return resp.json();
}

async function getAttachmentMeta(emailId: string) {
  const resp = await fetch(`${RESEND_API}/emails/receiving/${emailId}/attachments`, {
    headers: resendHeaders(),
  });
  if (!resp.ok) throw new Error(`Resend list attachments failed: ${resp.status}`);
  return resp.json();
}

async function getAttachmentDownloadUrl(emailId: string, attachmentId: string) {
  const resp = await fetch(
    `${RESEND_API}/emails/receiving/${emailId}/attachments/${attachmentId}`,
    { headers: resendHeaders() }
  );
  if (!resp.ok) throw new Error(`Resend get attachment failed: ${resp.status}`);
  return resp.json();
}

// ── Forward non-submit emails ────────────────────────────────────────────
async function forwardEmail({
  from,
  to,
  subject,
  emailId,
}: {
  from: string;
  to: string;
  subject: string;
  emailId: string;
}): Promise<void> {
  try {
    // Fetch full email content
    const emailContent = await getReceivedEmail(emailId);
    const bodyText: string = emailContent.text || '';
    const bodyHtml: string = emailContent.html || '';

    const forwardSubject = `[Fwd: ${to}] ${subject}`;
    const forwardHeader = `---------- Forwarded message ----------\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\n\n`;

    const payload: Record<string, string> = {
      from: FORWARD_FROM,
      to: FORWARD_TO,
      subject: forwardSubject,
    };

    if (bodyHtml) {
      payload.html = `<p style="color:#888;font-size:12px">Forwarded from <strong>${to}</strong> — original sender: ${from}</p><hr>${bodyHtml}`;
    } else {
      payload.text = forwardHeader + bodyText;
    }

    const resp = await fetch(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: resendHeaders(),
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[submit-email] Forward failed (${resp.status}): ${errText}`);
    } else {
      console.log(`[submit-email] Forwarded email from ${from} (to: ${to}) → ${FORWARD_TO}`);
    }
  } catch (err) {
    console.error('[submit-email] Forward error:', err);
  }
}

// ── Check if email is addressed to submit@ ──────────────────────────────
function isSubmitEmail(toAddresses: string | string[] | undefined): boolean {
  if (!toAddresses) return false;
  const addrs = Array.isArray(toAddresses) ? toAddresses : [toAddresses];
  return addrs.some(a => a.toLowerCase().includes('submit@'));
}

// ── Create submission from parsed email data ────────────────────────────
async function createSubmission({
  title,
  creatorWallet,
  creatorEmail,
  description,
  briefId,
  imageBuffer,
}: {
  title: string;
  creatorWallet: string;
  creatorEmail: string | null;
  description: string | null;
  briefId: string | null;
  imageBuffer: Buffer;
}) {
  // Validate wallet
  if (!creatorWallet || !/^0x[0-9a-fA-F]{40}$/.test(creatorWallet)) {
    return { error: 'Missing or invalid wallet. Email body must contain: wallet: 0x...', status: 400 };
  }

  // Validate title
  if (!title) {
    return { error: 'Could not extract title. Use subject: "RRG: Your Design Title"', status: 400 };
  }

  // Validate image format
  const format = detectImageFormat(imageBuffer);
  if (!format) {
    return { error: 'Attachment is not a valid JPEG or PNG', status: 400 };
  }

  if (imageBuffer.length > 5 * 1024 * 1024) {
    return { error: `Image is ${(imageBuffer.length / 1024 / 1024).toFixed(1)} MB — max 5 MB`, status: 400 };
  }

  const integrity = isImageComplete(imageBuffer);
  if (!integrity.ok) {
    return { error: integrity.reason!, status: 400 };
  }

  // Resolve brief
  let resolvedBriefId: string | null = null;
  let resolvedBrandId: string = RRG_BRAND_ID;

  if (briefId) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(briefId);
    if (isUUID) {
      const { data: brief } = await db
        .from('rrg_briefs').select('id, brand_id').eq('id', briefId).single();
      if (brief) { resolvedBriefId = brief.id; resolvedBrandId = brief.brand_id ?? RRG_BRAND_ID; }
    } else {
      const { data: brief } = await db
        .from('rrg_briefs').select('id, brand_id')
        .ilike('title', `%${briefId}%`).eq('status', 'active').limit(1).single();
      if (brief) { resolvedBriefId = brief.id; resolvedBrandId = brief.brand_id ?? RRG_BRAND_ID; }
    }
  }

  if (!resolvedBriefId) {
    const currentBrief = await getCurrentBrief();
    resolvedBriefId = currentBrief?.id ?? null;
    resolvedBrandId = currentBrief?.brand_id ?? RRG_BRAND_ID;
  }

  // Upload image
  const submissionId = randomUUID();
  const filename = `email-${Date.now()}.${format.ext}`;
  const storagePath = jpegStoragePath(submissionId, filename);
  await uploadSubmissionFile(storagePath, imageBuffer, format.mimeType);

  // Insert submission
  const { data, error } = await db
    .from('rrg_submissions')
    .insert({
      id:                 submissionId,
      brief_id:           resolvedBriefId,
      creator_wallet:     creatorWallet.toLowerCase(),
      creator_email:      creatorEmail,
      title,
      description,
      submission_channel: 'email',
      status:             'pending',
      jpeg_storage_path:  storagePath,
      jpeg_filename:      filename,
      jpeg_size_bytes:    imageBuffer.length,
      brand_id:           resolvedBrandId,
      creator_type:       'agent' as const,
    })
    .select()
    .single();

  if (error) throw error;

  console.log(`[submit-email] Created submission ${data.id} from ${creatorEmail} — "${title}"`);
  return { success: true, submissionId: data.id, title, creator_email: creatorEmail };
}

// ── Main handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    const rawBody = await req.text();

    // ── Resend webhook (email.received) ─────────────────────────────────
    if (contentType.includes('application/json')) {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
      }

      // Check if this is a Resend webhook event
      if (payload.type === 'email.received') {
        // Verify Resend/Svix webhook signature if secret is configured
        const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
        if (webhookSecret) {
          const svixId = req.headers.get('svix-id') || '';
          const svixTimestamp = req.headers.get('svix-timestamp') || '';
          const svixSignature = req.headers.get('svix-signature') || '';
          if (!svixId || !svixTimestamp || !svixSignature ||
              !verifyResendWebhook(rawBody, { svixId, svixTimestamp, svixSignature }, webhookSecret)) {
            console.warn('[submit-email] Invalid Resend webhook signature');
            return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 403 });
          }
        }

        const data = payload.data as Record<string, unknown>;
        const emailId = data.email_id as string;
        const from = data.from as string;
        const to = data.to as string | string[] | undefined;
        const subject = (data.subject as string) || '';
        const attachmentsMeta = (data.attachments as Array<Record<string, string>>) || [];

        const toStr = Array.isArray(to) ? to.join(', ') : (to || 'unknown');
        console.log(`[submit-email] Received email from ${from} to ${toStr}: "${subject}" (${attachmentsMeta.length} attachments)`);

        // ── Catch-all: forward non-submit emails ─────────────────────────
        if (!isSubmitEmail(to)) {
          console.log(`[submit-email] Not addressed to submit@ — forwarding to ${FORWARD_TO}`);
          await forwardEmail({ from, to: toStr, subject, emailId });
          return NextResponse.json({ received: true, forwarded: true, to: FORWARD_TO });
        }

        // Must have at least one attachment
        if (attachmentsMeta.length === 0) {
          console.warn(`[submit-email] No attachments in email from ${from}`);
          return NextResponse.json({ received: true, skipped: 'no attachments' });
        }

        // Fetch full email content (body text) from Resend API
        const emailContent = await getReceivedEmail(emailId);
        const bodyText: string = emailContent.text || emailContent.html || '';

        // Parse metadata from body
        const parsed = parseEmailBody(bodyText);
        const title = parseTitleFromSubject(subject) || 'Untitled Email Submission';
        const creatorEmail = from;

        // Find image attachment and download it
        // First, list attachments via API to get IDs
        const attachmentsList = await getAttachmentMeta(emailId);
        const attachments: Array<{ id: string; filename: string; content_type: string }> =
          attachmentsList.data || attachmentsList || [];

        let imageBuffer: Buffer | null = null;
        for (const att of attachments) {
          const isImage = att.content_type?.startsWith('image/') ||
            att.filename?.match(/\.(jpg|jpeg|png)$/i);
          if (!isImage) continue;

          // Get the download URL
          const attDetail = await getAttachmentDownloadUrl(emailId, att.id);
          const downloadUrl = attDetail.download_url || attDetail.url;
          if (!downloadUrl) continue;

          // Download the actual image
          const imgResp = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) });
          if (!imgResp.ok) continue;

          const buf = Buffer.from(await imgResp.arrayBuffer());
          if (detectImageFormat(buf)) {
            imageBuffer = buf;
            break;
          }
        }

        if (!imageBuffer) {
          console.warn(`[submit-email] No valid image attachment found in email from ${from}`);
          return NextResponse.json({ received: true, skipped: 'no valid image attachment' });
        }

        const result = await createSubmission({
          title,
          creatorWallet: parsed.wallet || '',
          creatorEmail,
          description: parsed.description || null,
          briefId: parsed.brief || null,
          imageBuffer,
        });

        if ('error' in result) {
          console.warn(`[submit-email] Validation failed: ${result.error}`);
          // Still return 200 to Resend so it doesn't retry
          return NextResponse.json({ received: true, error: result.error });
        }

        return NextResponse.json({ received: true, ...result }, { status: 201 });
      }

      // ── Direct JSON POST (manual/scripted) ────────────────────────────
      const secret = process.env.EMAIL_SUBMIT_SECRET;
      if (secret) {
        const authHeader = req.headers.get('x-email-submit-secret') || '';
        if (authHeader !== secret) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
      }

      const body = payload;
      const title = ((body.title as string) || '').trim().slice(0, 60);
      const creatorWallet = ((body.creator_wallet as string) || '').trim();
      const creatorEmail = ((body.sender_email as string) || (body.creator_email as string) || '').trim() || null;
      const description = ((body.description as string) || '').trim().slice(0, 280) || null;
      const briefId = ((body.brief_id as string) || (body.brief as string) || '').trim() || null;

      let imageBuffer: Buffer;
      if (body.image_base64) {
        const raw = (body.image_base64 as string).replace(/^data:image\/[a-z]+;base64,/i, '');
        imageBuffer = Buffer.from(raw, 'base64');
      } else if (body.image_url) {
        const resp = await fetch(body.image_url as string, {
          signal: AbortSignal.timeout(30_000),
          headers: { 'User-Agent': 'RRG-EmailSubmit/1.0' },
        });
        if (!resp.ok) {
          return NextResponse.json(
            { error: `Could not fetch image (HTTP ${resp.status})` },
            { status: 400 }
          );
        }
        imageBuffer = Buffer.from(await resp.arrayBuffer());
      } else {
        return NextResponse.json(
          { error: 'Provide image_base64 or image_url' },
          { status: 400 }
        );
      }

      const result = await createSubmission({
        title, creatorWallet, creatorEmail, description, briefId, imageBuffer,
      });

      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json({
        ...result,
        message: 'Email submission received and queued for review.',
      }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 });

  } catch (err) {
    console.error('[/api/rrg/submit-email]', err);
    return NextResponse.json(
      { error: 'Email submission processing failed.' },
      { status: 500 }
    );
  }
}
