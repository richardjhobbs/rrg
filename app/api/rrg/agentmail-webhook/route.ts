/**
 * POST /api/rrg/agentmail-webhook
 *
 * Webhook endpoint for AgentMail inbound emails.
 * When an agent (e.g. MindTheGap/Animoca Minds) emails our AgentMail inbox,
 * AgentMail fires this webhook. We download the image attachment and create
 * a submission — same pipeline as submit-email but via AgentMail instead of Resend.
 *
 * Flow:
 *   1. Agent emails submit@agentmail.to (or custom domain inbox)
 *   2. Agent's platform resolves any internal artifacts → real image attachments
 *   3. AgentMail receives the email and fires webhook to this endpoint
 *   4. We fetch the message + download image attachment via AgentMail API
 *   5. Parse metadata from subject/body, create submission
 *
 * Security: Verifies AGENTMAIL_WEBHOOK_SECRET if configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, getCurrentBrief, RRG_BRAND_ID } from '@/lib/rrg/db';
import { uploadSubmissionFile, jpegStoragePath } from '@/lib/rrg/storage';
import { randomUUID } from 'crypto';
import {
  getMessage,
  downloadAttachment,
  parseSubmissionEmail,
  detectImageFormat,
  replyToEmail,
} from '@/lib/rrg/agentmail';

export const dynamic = 'force-dynamic';

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

export async function POST(req: NextRequest) {
  try {
    // ── Verify webhook secret ─────────────────────────────────────────
    const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
    if (secret) {
      const authHeader = req.headers.get('authorization') || '';
      const querySecret = req.nextUrl.searchParams.get('secret');
      if (authHeader !== `Bearer ${secret}` && querySecret !== secret) {
        console.warn('[agentmail-webhook] Invalid webhook secret');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    const payload = await req.json();
    console.log('[agentmail-webhook] Received event:', JSON.stringify(payload).slice(0, 500));

    // ── Extract event data ────────────────────────────────────────────
    // AgentMail webhook payload structure
    const eventType = payload.type || payload.event_type || payload.eventType;
    const data = payload.data || payload;

    if (eventType && eventType !== 'message.received') {
      console.log(`[agentmail-webhook] Ignoring event type: ${eventType}`);
      return NextResponse.json({ received: true, ignored: eventType });
    }

    const inboxId = data.inbox_id || data.inboxId;
    const messageId = data.message_id || data.messageId;

    if (!inboxId || !messageId) {
      console.warn('[agentmail-webhook] Missing inbox_id or message_id');
      return NextResponse.json({ error: 'Missing inbox_id or message_id' }, { status: 400 });
    }

    // ── Fetch full message via AgentMail API ──────────────────────────
    const msg = await getMessage(inboxId, messageId);
    console.log(`[agentmail-webhook] Email from ${msg.from}: "${msg.subject}" (${msg.attachments?.length || 0} attachments)`);

    // ── Parse submission metadata ─────────────────────────────────────
    const bodyText = msg.text || msg.html?.replace(/<[^>]+>/g, ' ') || '';
    const parsed = parseSubmissionEmail(msg.subject, bodyText);

    if (!parsed.wallet) {
      console.warn(`[agentmail-webhook] No wallet found in email from ${msg.from}`);
      // Auto-reply with instructions
      try {
        await replyToEmail(inboxId, messageId, {
          text:
            'Thanks for your submission to RRG!\n\n' +
            'However, we could not find a wallet address in your email body.\n\n' +
            'Please resend with the following format:\n' +
            '  Subject: RRG: Your Design Title\n' +
            '  Body:\n' +
            '    wallet: 0xYourBaseWalletAddress\n' +
            '    description: Optional description\n' +
            '  Attachment: JPEG or PNG image\n\n' +
            '— RRG Platform',
        });
      } catch (replyErr) {
        console.error('[agentmail-webhook] Failed to send auto-reply:', replyErr);
      }
      return NextResponse.json({ received: true, error: 'No wallet in email body' });
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(parsed.wallet)) {
      console.warn(`[agentmail-webhook] Invalid wallet format: ${parsed.wallet}`);
      return NextResponse.json({ received: true, error: 'Invalid wallet format' });
    }

    // ── Find image attachment ─────────────────────────────────────────
    const imageAttachments = (msg.attachments || []).filter(a =>
      a.contentType?.startsWith('image/') ||
      a.filename?.match(/\.(jpg|jpeg|png)$/i),
    );

    if (imageAttachments.length === 0) {
      console.warn(`[agentmail-webhook] No image attachment from ${msg.from}`);
      try {
        await replyToEmail(inboxId, messageId, {
          text:
            'Thanks for your submission to RRG!\n\n' +
            'We could not find an image attachment. Please attach a JPEG or PNG file (max 5 MB).\n\n' +
            '— RRG Platform',
        });
      } catch (replyErr) {
        console.error('[agentmail-webhook] Failed to send auto-reply:', replyErr);
      }
      return NextResponse.json({ received: true, error: 'No image attachment' });
    }

    // ── Download and validate image ───────────────────────────────────
    let imageBuffer: Buffer | null = null;
    let usedAttachment: string | null = null;

    for (const att of imageAttachments) {
      try {
        console.log(`[agentmail-webhook] Downloading attachment: ${att.filename} (${att.contentType})`);
        const buf = await downloadAttachment(inboxId, messageId, att.attachmentId);

        if (!detectImageFormat(buf)) {
          console.warn(`[agentmail-webhook] Attachment ${att.filename} is not a valid JPEG/PNG`);
          continue;
        }

        if (buf.length > 5 * 1024 * 1024) {
          console.warn(`[agentmail-webhook] Attachment ${att.filename} is ${(buf.length / 1024 / 1024).toFixed(1)} MB — too large`);
          continue;
        }

        const integrity = isImageComplete(buf);
        if (!integrity.ok) {
          console.warn(`[agentmail-webhook] Attachment ${att.filename}: ${integrity.reason}`);
          continue;
        }

        imageBuffer = buf;
        usedAttachment = att.filename;
        break;
      } catch (dlErr) {
        console.error(`[agentmail-webhook] Failed to download attachment ${att.attachmentId}:`, dlErr);
      }
    }

    if (!imageBuffer) {
      console.warn(`[agentmail-webhook] No valid image found in attachments from ${msg.from}`);
      return NextResponse.json({ received: true, error: 'No valid image in attachments' });
    }

    // ── Resolve brief ─────────────────────────────────────────────────
    let resolvedBriefId: string | null = null;
    let resolvedBrandId: string = RRG_BRAND_ID;

    if (parsed.briefId) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.briefId);
      if (isUUID) {
        const { data: brief } = await db
          .from('rrg_briefs').select('id, brand_id').eq('id', parsed.briefId).single();
        if (brief) { resolvedBriefId = brief.id; resolvedBrandId = brief.brand_id ?? RRG_BRAND_ID; }
      } else {
        const { data: brief } = await db
          .from('rrg_briefs').select('id, brand_id')
          .ilike('title', `%${parsed.briefId}%`).eq('status', 'active').limit(1).single();
        if (brief) { resolvedBriefId = brief.id; resolvedBrandId = brief.brand_id ?? RRG_BRAND_ID; }
      }
    }

    if (!resolvedBriefId) {
      const currentBrief = await getCurrentBrief();
      resolvedBriefId = currentBrief?.id ?? null;
      resolvedBrandId = currentBrief?.brand_id ?? RRG_BRAND_ID;
    }

    // ── Upload image to Supabase ──────────────────────────────────────
    const format = detectImageFormat(imageBuffer)!;
    const submissionId = randomUUID();
    const filename = `agentmail-${Date.now()}.${format.ext}`;
    const storagePath = jpegStoragePath(submissionId, filename);
    await uploadSubmissionFile(storagePath, imageBuffer, format.mimeType);

    // ── Create submission ─────────────────────────────────────────────
    const title = parsed.title || 'Untitled Email Submission';
    const { data: submission, error } = await db
      .from('rrg_submissions')
      .insert({
        id: submissionId,
        brief_id: resolvedBriefId,
        creator_wallet: parsed.wallet.toLowerCase(),
        creator_email: msg.from,
        title,
        description: parsed.description,
        submission_channel: 'agentmail',
        status: 'pending',
        jpeg_storage_path: storagePath,
        jpeg_filename: filename,
        jpeg_size_bytes: imageBuffer.length,
        brand_id: resolvedBrandId,
        creator_type: 'agent' as const,
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[agentmail-webhook] ✅ Created submission ${submission.id} from ${msg.from} — "${title}" (${usedAttachment}, ${(imageBuffer.length / 1024).toFixed(0)} KB)`);

    // ── Auto-reply with confirmation ──────────────────────────────────
    try {
      await replyToEmail(inboxId, messageId, {
        text:
          `Your design "${title}" has been received and is queued for review.\n\n` +
          `Submission ID: ${submission.id}\n` +
          `Creator wallet: ${parsed.wallet}\n\n` +
          `You'll be able to see your drop at https://realrealgenuine.com/rrg once approved.\n\n` +
          `— RRG Platform`,
      });
    } catch (replyErr) {
      console.error('[agentmail-webhook] Failed to send confirmation reply:', replyErr);
    }

    return NextResponse.json({
      received: true,
      success: true,
      submissionId: submission.id,
      title,
      creator_email: msg.from,
      attachment: usedAttachment,
      image_size_kb: Math.round(imageBuffer.length / 1024),
    }, { status: 201 });

  } catch (err) {
    console.error('[agentmail-webhook] Error:', err);
    return NextResponse.json(
      { error: 'AgentMail webhook processing failed' },
      { status: 500 },
    );
  }
}
