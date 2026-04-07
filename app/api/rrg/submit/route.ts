import { NextRequest, NextResponse } from 'next/server';
import { db, getCurrentBrief, RRG_BRAND_ID } from '@/lib/rrg/db';
import { uploadSubmissionFile, jpegStoragePath, additionalFileStoragePath } from '@/lib/rrg/storage';
import { screenSubmissionAsync } from '@/lib/rrg/vision';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

// POST /api/rrg/submit — public: receive submission + store files
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // ── Required fields ─────────────────────────────────────────────
    const title          = (formData.get('title') as string)?.trim();
    const creator_wallet = (formData.get('creator_wallet') as string)?.trim().toLowerCase();
    const jpeg           = formData.get('jpeg') as File | null;

    if (!title || title.length > 60) {
      return NextResponse.json({ error: 'title required, max 60 chars' }, { status: 400 });
    }
    if (!creator_wallet || !/^0x[0-9a-f]{40}$/i.test(creator_wallet)) {
      return NextResponse.json({ error: 'Valid EVM wallet address required' }, { status: 400 });
    }
    const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!jpeg || !ACCEPTED_IMAGE_TYPES.includes(jpeg.type)) {
      return NextResponse.json({ error: 'JPEG or PNG file required' }, { status: 400 });
    }
    if (jpeg.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 });
    }

    // ── Optional fields ──────────────────────────────────────────────
    const rawDescription    = (formData.get('description') as string)?.trim().slice(0, 280) || '';
    const creator_email     = (formData.get('creator_email') as string)?.trim() || null;
    const creator_handle    = (formData.get('creator_handle') as string)?.trim() || null;
    const creator_bio       = (formData.get('creator_bio') as string)?.trim().slice(0, 2000) || null;
    const brief_id          = (formData.get('brief_id') as string) || null;
    const submission_channel: string = (formData.get('channel') as string) || 'web';

    // ── T&C acceptance (required for web submissions) ────────────────
    const tc_accepted       = formData.get('tc_accepted') as string;
    if (submission_channel === 'web' && tc_accepted !== '1') {
      return NextResponse.json({ error: 'You must accept the Creator Terms & Conditions' }, { status: 400 });
    }

    // ── Submitter suggestions (shown in admin, appended to description) ─
    const suggestedEdition  = (formData.get('suggested_edition') as string)?.trim() || '';
    const suggestedPrice    = (formData.get('suggested_price_usdc') as string)?.trim() || '';
    const suggestionTag     = (suggestedEdition || suggestedPrice)
      ? `[Suggested: ${suggestedEdition || '?'} ed · $${suggestedPrice || '?'} USDC]`
      : '';
    const description       = rawDescription
      ? (suggestionTag ? `${rawDescription}\n${suggestionTag}` : rawDescription)
      : (suggestionTag || null);

    // ── Additional files validation ──────────────────────────────────
    const additionalFiles: File[] = [];
    let additionalFilesTotal = 0;

    for (const [key, val] of formData.entries()) {
      if (key === 'additional_files' && val instanceof File) {
        additionalFilesTotal += val.size;
        additionalFiles.push(val);
      }
    }
    if (additionalFilesTotal > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Additional files must total under 5 MB' }, { status: 400 });
    }

    // ── Resolve brand_id: explicit > brief-derived > default ──────────
    const explicit_brand_id = (formData.get('brand_id') as string)?.trim() || null;
    let resolvedBriefId = brief_id;
    let resolvedBrandId: string = explicit_brand_id || RRG_BRAND_ID;

    if (!resolvedBriefId) {
      const currentBrief = await getCurrentBrief(explicit_brand_id || undefined);
      resolvedBriefId = currentBrief?.id ?? null;
      if (!explicit_brand_id) {
        resolvedBrandId = currentBrief?.brand_id ?? RRG_BRAND_ID;
      }
    } else if (!explicit_brand_id) {
      // If brief_id was provided but no explicit brand_id, resolve from brief
      const { data: brief } = await db
        .from('rrg_briefs')
        .select('brand_id')
        .eq('id', resolvedBriefId)
        .single();
      resolvedBrandId = brief?.brand_id ?? RRG_BRAND_ID;
    }

    // ── Generate submission ID ────────────────────────────────────────
    const submissionId = randomUUID();

    // ── Upload image (JPEG or PNG) ────────────────────────────────────
    const jpegBuffer = Buffer.from(await jpeg.arrayBuffer());
    const jpegPath   = jpegStoragePath(submissionId, jpeg.name);
    await uploadSubmissionFile(jpegPath, jpegBuffer, jpeg.type);

    // ── Upload additional files ────────────────────────────────────────
    let additionalPath: string | null = null;
    if (additionalFiles.length > 0) {
      for (const file of additionalFiles) {
        const buf  = Buffer.from(await file.arrayBuffer());
        const path = additionalFileStoragePath(submissionId, file.name);
        await uploadSubmissionFile(path, buf, file.type || 'application/octet-stream');
      }
      additionalPath = `submissions/${submissionId}/additional/`;
    }

    // ── Insert submission record ──────────────────────────────────────
    // Status starts as 'ai_screening' when there's a brief to check against,
    // otherwise goes straight to 'pending' for manual review.
    const initialStatus = resolvedBriefId ? 'ai_screening' : 'pending';

    const { data, error } = await db
      .from('rrg_submissions')
      .insert({
        id:                  submissionId,
        brief_id:            resolvedBriefId || null,
        creator_wallet,
        creator_email,
        creator_handle,
        creator_bio,
        title,
        description,
        submission_channel,
        status:              initialStatus,
        jpeg_storage_path:   jpegPath,
        jpeg_filename:       jpeg.name,
        jpeg_size_bytes:     jpeg.size,
        additional_files_path:        additionalPath,
        additional_files_size_bytes:  additionalFilesTotal || null,
        brand_id:            resolvedBrandId,
        creator_type:        'human' as const,
      })
      .select()
      .single();

    if (error) throw error;

    // ── Vision screening (fire-and-forget, does not block response) ────
    if (resolvedBriefId && initialStatus === 'ai_screening') {
      const brief = await db
        .from('rrg_briefs')
        .select('title, description')
        .eq('id', resolvedBriefId)
        .single()
        .then(r => r.data);

      if (brief) {
        screenSubmissionAsync(
          data.id,
          jpegBuffer,
          brief.title,
          brief.description ?? '',
        ).catch((err) => console.error('[submit] screenSubmissionAsync failed:', err));
      } else {
        // No brief found — promote to pending immediately
        void db.from('rrg_submissions')
          .update({ status: 'pending' })
          .eq('id', data.id);
      }
    }

    return NextResponse.json({
      success:      true,
      submissionId: data.id,
      message:      'Submission received. We review all designs and will notify you if approved.',
    }, { status: 201 });

  } catch (err) {
    console.error('[/api/rrg/submit]', err);
    return NextResponse.json({ error: 'Submission failed. Please try again.' }, { status: 500 });
  }
}
