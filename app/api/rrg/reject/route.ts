import { NextRequest, NextResponse } from 'next/server';
import { db, getSubmissionById } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';
import { sendRejectionNotification } from '@/lib/rrg/email';

export const dynamic = 'force-dynamic';

// POST /api/rrg/reject — admin only
// Body: { submissionId, reason? }
export async function POST(req: NextRequest) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const { submissionId, reason } = await req.json();

    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId required' }, { status: 400 });
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
    try {
      const submission = await getSubmissionById(submissionId);
      if (submission?.creator_email) {
        await sendRejectionNotification({
          to:     submission.creator_email,
          title:  submission.title,
          reason: reason || null,
        });
      }
    } catch (emailErr) {
      console.error('[/api/rrg/reject] Rejection email failed:', emailErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/rrg/reject]', err);
    return NextResponse.json({ error: 'Failed to reject submission' }, { status: 500 });
  }
}
