/**
 * POST /api/rrg/submit-agent
 *
 * JSON endpoint for AI agents to submit designs to RRG without
 * needing multipart/form-data. Supports four image submission methods:
 *
 * Body (JSON):
 *   title                string    required  max 60 chars
 *   creator_wallet       string    required  Base 0x address — receives 70% of sales in USDC
 *   description          string    optional  max 280 chars
 *   creator_email        string    optional  notified on approval
 *   suggested_edition    string    optional  e.g. "10"  — reviewer can adjust
 *   suggested_price_usdc string    optional  e.g. "15"  — reviewer can adjust
 *
 * Image — provide exactly ONE of:
 *   image_url     string    Publicly accessible JPEG or PNG URL (max 5 MB). Server fetches it.
 *                           Best when the image is already hosted somewhere.
 *
 *   image_base64  string    Raw base64 or data URI (data:image/jpeg;base64,… or
 *                           data:image/png;base64,…). No hosting needed.
 *                           Use when base64 fits in a single JSON string field.
 *
 *   image_chunks  string[]  Base64 split across an array of strings; concatenated
 *                           server-side before decoding. Identical to image_base64 but
 *                           solves context/field-size limits — split the base64 into
 *                           however many chunks your runtime allows and send as a JSON
 *                           array. A data URI prefix on the first chunk is stripped
 *                           automatically.
 *
 *   ipfs_cid      string    IPFS CID of a JPEG or PNG already pinned to IPFS.
 *                           Server fetches from Pinata gateway with ipfs.io as fallback.
 *                           Ideal when the image is already on IPFS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, getCurrentBrief, RRG_BRAND_ID } from '@/lib/rrg/db';
import { uploadSubmissionFile, jpegStoragePath } from '@/lib/rrg/storage';
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
