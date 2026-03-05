import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { uploadSubmissionFile, jpegStoragePath, additionalFileStoragePath } from '@/lib/rrg/storage';
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
    if (!jpeg || jpeg.type !== 'image/jpeg') {
      return NextResponse.json({ error: 'JPEG file required' }, { status: 400 });
    }
    if (jpeg.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'JPEG must be under 5 MB' }, { status: 400 });
    }

    // ── Optional fields ──────────────────────────────────────────────
    const description       = (formData.get('description') as string)?.trim().slice(0, 280) || null;
    const creator_email     = (formData.get('creator_email') as string)?.trim() || null;
    const creator_handle    = (formData.get('creator_handle') as string)?.trim() || null;
    const brief_id          = (formData.get('brief_id') as string) || null;
    const submission_channel: string = (formData.get('channel') as string) || 'web';

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

    // ── Generate submission ID ────────────────────────────────────────
    const submissionId = randomUUID();

    // ── Upload JPEG ───────────────────────────────────────────────────
    const jpegBuffer = Buffer.from(await jpeg.arrayBuffer());
    const jpegPath   = jpegStoragePath(submissionId, jpeg.name);
    await uploadSubmissionFile(jpegPath, jpegBuffer, 'image/jpeg');

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
    const { data, error } = await db
      .from('rrg_submissions')
      .insert({
        id:                  submissionId,
        brief_id:            brief_id || null,
        creator_wallet,
        creator_email,
        creator_handle,
        title,
        description,
        submission_channel,
        status:              'pending',
        jpeg_storage_path:   jpegPath,
        jpeg_filename:       jpeg.name,
        jpeg_size_bytes:     jpeg.size,
        additional_files_path:        additionalPath,
        additional_files_size_bytes:  additionalFilesTotal || null,
      })
      .select()
      .single();

    if (error) throw error;

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
