import { NextRequest, NextResponse } from 'next/server';
import { db, getSubmissionById } from '@/lib/rrg/db';
import { requireBrandAuth } from '@/lib/rrg/brand-auth';
import { sendRejectionNotification } from '@/lib/rrg/email';

export const dynamic = 'force-dynamic';

// POST /api/brand/[brandId]/reject — brand admin rejects a submission
// Body: { submissionId, reason? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const { submissionId, reason } = await req.json();

    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId required' }, { status: 400 });
    }

    // Verify submission belongs to this brand
    const submission = await getSubmissionById(submissionId);
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }
    if (submission.brand_id !== brandId) {
      return NextResponse.json({ error: 'Submission does not belong to this brand' }, { status: 403 });
    }

    const { error } = await db
      .from('rrg_submissions')
      .update({
        status:          'rejected',
        rejected_reason: reason || null,
      })
      .eq('id', submissionId)
      .eq('status', 'pending');

    if (error) throw error;

    // Send rejection email if creator provided an email (non-fatal)
    if (submission.creator_email) {
      try {
        await sendRejectionNotification({
          to:     submission.creator_email,
          title:  submission.title,
          reason: reason || null,
        });
      } catch (emailErr) {
        console.error(`[brand/${brandId}/reject] Rejection email failed:`, emailErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[/api/brand/${brandId}/reject]`, err);
    return NextResponse.json({ error: 'Failed to reject submission' }, { status: 500 });
  }
}
