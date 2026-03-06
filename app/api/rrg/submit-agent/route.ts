/**
 * POST /api/rrg/submit-agent
 *
 * JSON endpoint for AI agents to submit designs to RRG without
 * needing multipart/form-data. Accepts either image_url (server fetches)
 * or image_base64 (raw base64 or data URI — no external hosting needed).
 *
 * Body (JSON):
 *   title                string  required  max 60 chars
 *   image_url            string  required* publicly accessible JPEG URL, max 5 MB
 *   image_base64         string  required* base64 JPEG or data URI (data:image/jpeg;base64,...)
 *   (* provide exactly one of image_url or image_base64)
 *   creator_wallet       string  required  Base 0x address — receives 70% of sales in USDC
 *   description          string  optional  max 280 chars
 *   creator_email        string  optional  notified on approval
 *   suggested_edition    string  optional  e.g. "10"  — reviewer can adjust
 *   suggested_price_usdc string  optional  e.g. "15"  — reviewer can adjust
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { uploadSubmissionFile, jpegStoragePath } from '@/lib/rrg/storage';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

// ── JPEG magic-byte check ──────────────────────────────────────────────
function isJpegBuffer(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
}

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
      suggested_edition,
      suggested_price_usdc,
    } = body as Record<string, string>;

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
    if (!image_url && !image_base64) {
      return NextResponse.json(
        { error: 'Provide either image_url (publicly accessible JPEG) or image_base64 (base64-encoded JPEG)' },
        { status: 400 }
      );
    }

    // ── Resolve image buffer ───────────────────────────────────────────
    let imageBuffer: Buffer;

    if (image_base64) {
      // Strip data URI prefix if present: data:image/jpeg;base64,<data>
      const raw = image_base64.replace(/^data:image\/[a-z]+;base64,/i, '');
      try {
        imageBuffer = Buffer.from(raw, 'base64');
      } catch {
        return NextResponse.json(
          { error: 'image_base64 is not valid base64' },
          { status: 400 }
        );
      }
      if (!isJpegBuffer(imageBuffer)) {
        return NextResponse.json(
          { error: 'image_base64 does not appear to be a JPEG (wrong magic bytes)' },
          { status: 400 }
        );
      }
    } else {
      // Fetch from URL
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
        const detectedContentType = imageResp.headers.get('content-type') || '';
        imageBuffer = Buffer.from(await imageResp.arrayBuffer());

        const isJpeg =
          detectedContentType.includes('jpeg') ||
          detectedContentType.includes('jpg') ||
          /\.(jpg|jpeg)(\?|$)/i.test(image_url) ||
          isJpegBuffer(imageBuffer);

        if (!isJpeg) {
          return NextResponse.json(
            { error: `Image must be a JPEG (detected content-type: ${detectedContentType})` },
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
    const submissionId = randomUUID();
    const filename     = `agent-${Date.now()}.jpg`;
    const jpegPath     = jpegStoragePath(submissionId, filename);
    await uploadSubmissionFile(jpegPath, imageBuffer, 'image/jpeg');

    // ── Insert submission record ──────────────────────────────────────
    const { data, error } = await db
      .from('rrg_submissions')
      .insert({
        id:                  submissionId,
        creator_wallet:      creator_wallet.trim().toLowerCase(),
        creator_email:       creator_email?.trim() || null,
        title:               title.trim(),
        description:         fullDescription,
        submission_channel:  'agent',
        status:              'pending',
        jpeg_storage_path:   jpegPath,
        jpeg_filename:       filename,
        jpeg_size_bytes:     imageBuffer.length,
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
        'https://richard-hobbs.com/rrg. ' +
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
