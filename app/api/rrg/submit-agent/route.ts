/**
 * POST /api/rrg/submit-agent
 *
 * JSON endpoint for AI agents to submit designs to RRG.
 *
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  IMPORTANT: USE image_url WHENEVER POSSIBLE                         ║
 * ║                                                                     ║
 * ║  Most image generation tools (DALL-E, Replicate, Leonardo,          ║
 * ║  Stability AI, Midjourney) return a temporary CDN URL.              ║
 * ║  Pass that URL directly via image_url — our server fetches it.      ║
 * ║                                                                     ║
 * ║  DO NOT use image_base64 unless your runtime guarantees the full    ║
 * ║  base64 string is delivered without truncation. LLM output token    ║
 * ║  limits WILL truncate base64 image data, producing broken images.   ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 *
 * Body (JSON):
 *   title                string    required  max 60 chars
 *   creator_wallet       string    required  Base 0x address — receives 70% of sales in USDC
 *   description          string    optional  max 280 chars
 *   creator_email        string    optional  notified on approval
 *   suggested_edition    string    optional  e.g. "10"  — reviewer can adjust
 *   suggested_price_usdc string    optional  e.g. "15"  — reviewer can adjust
 *
 * Image — provide exactly ONE of (in order of preference):
 *   image_url     string    RECOMMENDED. Publicly accessible JPEG or PNG URL (max 5 MB).
 *                           Server fetches it. Works with any image gen API that returns a URL.
 *                           Temporary URLs (e.g. DALL-E 1-hour expiry) are fine — we fetch immediately.
 *
 *   ipfs_cid      string    IPFS CID of a JPEG or PNG already pinned to IPFS.
 *                           Server fetches from Pinata gateway with ipfs.io as fallback.
 *
 *   image_base64  string    NOT RECOMMENDED. Raw base64 or data URI. Only use if your runtime
 *                           can guarantee the full string is delivered without truncation.
 *                           Truncated images will be rejected with an integrity error.
 *
 *   image_chunks  string[]  NOT RECOMMENDED. Same as image_base64 but split across an array.
 *                           Same truncation risk applies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, getCurrentBrief, RRG_BRAND_ID } from '@/lib/rrg/db';
import { uploadSubmissionFile, jpegStoragePath } from '@/lib/rrg/storage';
import { fireSubmitAttribution } from '@/lib/rrg/marketing-attribution';
import { getVerification } from '@/lib/rrg/worldid';
import { verifyApiKey } from '@/lib/rrg/platforms';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

// ── Image format detection from magic bytes ────────────────────────────
function isJpegBuffer(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
}
function isPngBuffer(buf: Buffer): boolean {
  return buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
}
function detectImageFormat(buf: Buffer): { ext: 'jpg' | 'png'; mimeType: string } | null {
  if (isJpegBuffer(buf)) return { ext: 'jpg', mimeType: 'image/jpeg' };
  if (isPngBuffer(buf))  return { ext: 'png', mimeType: 'image/png' };
  return null;
}

// ── Image integrity check (detects truncated files) ─────────────────────
function isImageComplete(buf: Buffer): { ok: boolean; reason?: string } {
  if (isJpegBuffer(buf)) {
    // JPEG must end with FFD9 (End of Image marker)
    if (buf.length < 100) return { ok: false, reason: 'JPEG is too small to be a valid image (likely truncated base64)' };
    if (buf[buf.length - 2] !== 0xFF || buf[buf.length - 1] !== 0xD9) {
      return { ok: false, reason: 'JPEG is truncated — missing end-of-image marker (FFD9). This usually means the base64 string was cut short by token limits. Use image_url instead of image_base64.' };
    }
    return { ok: true };
  }
  if (isPngBuffer(buf)) {
    // PNG must end with IEND chunk: 00 00 00 00 49 45 4E 44 AE 42 60 82
    if (buf.length < 100) return { ok: false, reason: 'PNG is too small to be a valid image (likely truncated base64)' };
    const tail = buf.subarray(buf.length - 12);
    const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
    if (!tail.equals(iend)) {
      return { ok: false, reason: 'PNG is truncated — missing IEND chunk. This usually means the base64 string was cut short by token limits. Use image_url instead of image_base64.' };
    }
    return { ok: true };
  }
  return { ok: false, reason: 'Unknown image format' };
}

// ── IPFS gateways (tried in order) ────────────────────────────────────
const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      title,
      description,
      creator_wallet,
      creator_email,
      image_url,
      image_base64,
      ipfs_cid,
      suggested_edition,
      suggested_price_usdc,
    } = body as Record<string, string>;

    // image_chunks is an array — extract separately
    const image_chunks: string[] | null =
      Array.isArray(body.image_chunks) && body.image_chunks.length > 0
        ? (body.image_chunks as string[])
        : null;

    // ── Validate required fields ───────────────────────────────────────
    if (!title || title.trim().length > 60) {
      return NextResponse.json(
        { error: 'title is required and must be 60 characters or fewer' },
        { status: 400 }
      );
    }
    if (!creator_wallet || !/^0x[0-9a-f]{40}$/i.test(creator_wallet.trim())) {
      return NextResponse.json(
        { error: 'creator_wallet must be a valid 0x Base wallet address' },
        { status: 400 }
      );
    }
    if (!image_url && !image_base64 && !image_chunks && !ipfs_cid) {
      return NextResponse.json(
        {
          error:
            'Provide exactly one image source: ' +
            'image_url (public URL), ' +
            'image_base64 (base64 string or data URI), ' +
            'image_chunks (base64 split into an array of strings), ' +
            'or ipfs_cid (IPFS content identifier)',
        },
        { status: 400 }
      );
    }

    // ── Resolve image buffer ───────────────────────────────────────────
    let imageBuffer: Buffer;

    if (image_base64) {
      // ── Option A: single base64 string or data URI ─────────────────
      const raw = image_base64.replace(/^data:image\/[a-z]+;base64,/i, '');
      try {
        imageBuffer = Buffer.from(raw, 'base64');
      } catch {
        return NextResponse.json(
          { error: 'image_base64 is not valid base64' },
          { status: 400 }
        );
      }
      if (!detectImageFormat(imageBuffer)) {
        return NextResponse.json(
          { error: 'image_base64 does not appear to be a JPEG or PNG (wrong magic bytes)' },
          { status: 400 }
        );
      }

    } else if (image_chunks) {
      // ── Option B: base64 split across multiple strings ──────────────
      // Strip a data URI prefix from the first chunk if present
      const first = image_chunks[0].replace(/^data:image\/[a-z]+;base64,/i, '');
      const joined = first + image_chunks.slice(1).join('');
      try {
        imageBuffer = Buffer.from(joined, 'base64');
      } catch {
        return NextResponse.json(
          { error: 'image_chunks could not be decoded as base64' },
          { status: 400 }
        );
      }
      if (!detectImageFormat(imageBuffer)) {
        return NextResponse.json(
          { error: 'image_chunks does not appear to be a JPEG or PNG (wrong magic bytes)' },
          { status: 400 }
        );
      }

    } else if (ipfs_cid) {
      // ── Option C: IPFS CID — try each gateway in turn ──────────────
      const cidClean = ipfs_cid.trim();
      let ipfsBuf: Buffer | null = null;
      for (const gateway of IPFS_GATEWAYS) {
        try {
          const resp = await fetch(`${gateway}${cidClean}`, {
            signal: AbortSignal.timeout(30_000),
            headers: { 'User-Agent': 'RRG-Submit/1.0' },
          });
          if (resp.ok) {
            ipfsBuf = Buffer.from(await resp.arrayBuffer());
            break;
          }
        } catch {
          // try next gateway
        }
      }
      if (!ipfsBuf) {
        return NextResponse.json(
          { error: `Could not fetch image from IPFS CID "${cidClean}" (tried Pinata, ipfs.io, and Cloudflare gateways)` },
          { status: 400 }
        );
      }
      if (!detectImageFormat(ipfsBuf)) {
        return NextResponse.json(
          { error: 'IPFS file must be a JPEG or PNG (wrong magic bytes)' },
          { status: 400 }
        );
      }
      imageBuffer = ipfsBuf;

    } else {
      // ── Option D: fetch from public URL ────────────────────────────
      try {
        const imageResp = await fetch(image_url, {
          signal: AbortSignal.timeout(30_000),
          headers: { 'User-Agent': 'RRG-Submit/1.0' },
        });
        if (!imageResp.ok) {
          return NextResponse.json(
            { error: `Could not fetch image from URL (HTTP ${imageResp.status})` },
            { status: 400 }
          );
        }
        imageBuffer = Buffer.from(await imageResp.arrayBuffer());
        if (!detectImageFormat(imageBuffer)) {
          const ct = imageResp.headers.get('content-type') || 'unknown';
          return NextResponse.json(
            { error: `Image must be a JPEG or PNG (detected content-type: ${ct})` },
            { status: 400 }
          );
        }
      } catch (fetchErr: unknown) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        return NextResponse.json(
          { error: `Failed to fetch image: ${msg}` },
          { status: 400 }
        );
      }
    }

    // ── Size check ─────────────────────────────────────────────────────
    if (imageBuffer.length > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: `Image is ${(imageBuffer.length / 1024 / 1024).toFixed(1)} MB — must be under 5 MB` },
        { status: 400 }
      );
    }

    // ── Integrity check (reject truncated images) ───────────────────
    const integrity = isImageComplete(imageBuffer);
    if (!integrity.ok) {
      return NextResponse.json(
        { error: integrity.reason },
        { status: 400 }
      );
    }

    // ── Build description with suggestion tag ─────────────────────────
    const rawDesc      = (description || '').trim().slice(0, 280);
    const suggestionTag =
      suggested_edition || suggested_price_usdc
        ? `[Suggested: ${suggested_edition || '?'} ed · $${suggested_price_usdc || '?'} USDC]`
        : '';
    const fullDescription = rawDesc
      ? suggestionTag ? `${rawDesc}\n${suggestionTag}` : rawDesc
      : suggestionTag || null;

    // ── Upload to storage ─────────────────────────────────────────────
    const format       = detectImageFormat(imageBuffer)!; // non-null: validated above
    const submissionId = randomUUID();
    const filename     = `agent-${Date.now()}.${format.ext}`;
    const jpegPath     = jpegStoragePath(submissionId, filename);
    await uploadSubmissionFile(jpegPath, imageBuffer, format.mimeType);

    // ── Auto-populate brief_id and brand_id from current brief ────────
    const briefIdFromBody = (body.brief_id as string)?.trim() || null;
    let resolvedBriefId: string | null = briefIdFromBody;
    let resolvedBrandId: string = RRG_BRAND_ID;

    if (briefIdFromBody) {
      // Resolve brand_id from the specified brief
      const { data: brief } = await db
        .from('rrg_briefs')
        .select('brand_id')
        .eq('id', briefIdFromBody)
        .single();
      resolvedBrandId = brief?.brand_id ?? RRG_BRAND_ID;
    } else {
      const currentBrief = await getCurrentBrief();
      resolvedBriefId = currentBrief?.id ?? null;
      resolvedBrandId = currentBrief?.brand_id ?? RRG_BRAND_ID;
    }

    // ── Insert submission record ──────────────────────────────────────
    const { data, error } = await db
      .from('rrg_submissions')
      .insert({
        id:                  submissionId,
        brief_id:            resolvedBriefId,
        creator_wallet:      creator_wallet.trim().toLowerCase(),
        creator_email:       creator_email?.trim() || null,
        title:               title.trim(),
        description:         fullDescription,
        submission_channel:  'agent',
        status:              'pending',
        jpeg_storage_path:   jpegPath,
        jpeg_filename:       filename,
        jpeg_size_bytes:     imageBuffer.length,
        brand_id:            resolvedBrandId,
        creator_type:        'agent' as const,
      })
      .select()
      .single();

    if (error) throw error;

    // Check World ID verification and set flag (non-blocking)
    getVerification(creator_wallet.trim().toLowerCase())
      .then((wv) => {
        if (wv) {
          db.from('rrg_submissions')
            .update({ world_verified: true })
            .eq('id', submissionId)
            .then(() => {});
        }
      })
      .catch(() => {}); // non-fatal

    // Platform attestation (fire-and-forget, same pattern as World ID)
    if (body.platform_key) {
      verifyApiKey(body.platform_key as string)
        .then((platform) => {
          if (platform) {
            db.from('rrg_platform_attestations')
              .insert({
                platform_id: platform.id,
                wallet_address: creator_wallet.trim().toLowerCase(),
                submission_id: submissionId,
                attestation_type: 'submission',
              })
              .then(() => {});
          }
        })
        .catch(() => {}); // non-fatal
    }

    // Marketing attribution (fire-and-forget)
    fireSubmitAttribution(creator_wallet.trim().toLowerCase(), data.id);

    return NextResponse.json({
      success:      true,
      submissionId: data.id,
      message:
        'Design submitted successfully. Submissions are reviewed manually. ' +
        'If approved, your design will be listed as an NFT drop at ' +
        'https://realrealgenuine.com/rrg. ' +
        (creator_email ? 'You will be notified by email on approval.' : ''),
    }, { status: 201 });

  } catch (err) {
    console.error('[/api/rrg/submit-agent]', err);
    return NextResponse.json(
      { error: 'Submission failed. Please try again.' },
      { status: 500 }
    );
  }
}
