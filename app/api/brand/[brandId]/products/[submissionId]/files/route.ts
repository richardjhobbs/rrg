import { NextRequest, NextResponse } from 'next/server';
import { requireBrandAuth } from '@/lib/rrg/brand-auth';
import { db, getSubmissionById } from '@/lib/rrg/db';
import { deleteFile } from '@/lib/rrg/storage';

export const dynamic = 'force-dynamic';

// DELETE /api/brand/[brandId]/products/[submissionId]/files — remove additional files
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ brandId: string; submissionId: string }> },
) {
  const { brandId, submissionId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const submission = await getSubmissionById(submissionId);
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }
    if (submission.brand_id !== brandId) {
      return NextResponse.json({ error: 'Submission does not belong to this brand' }, { status: 403 });
    }
    if (!submission.additional_files_path) {
      return NextResponse.json({ error: 'No additional files to remove' }, { status: 400 });
    }

    // Block removal if any edition has been sold (minted)
    if (submission.token_id != null) {
      const { count } = await db
        .from('rrg_purchases')
        .select('id', { count: 'exact', head: true })
        .eq('token_id', submission.token_id);
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: 'Cannot remove files — this product has sales. Buyers are entitled to these files.' },
          { status: 409 },
        );
      }
    }

    // Delete from storage
    try {
      await deleteFile(submission.additional_files_path);
    } catch (err) {
      console.warn('[remove-files] Storage delete failed (may already be gone):', err);
    }

    // Clear in DB
    const { error } = await db
      .from('rrg_submissions')
      .update({
        additional_files_path: null,
        additional_files_size_bytes: null,
      })
      .eq('id', submissionId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[/api/brand/${brandId}/products/${submissionId}/files]`, err);
    return NextResponse.json({ error: 'Failed to remove files' }, { status: 500 });
  }
}
