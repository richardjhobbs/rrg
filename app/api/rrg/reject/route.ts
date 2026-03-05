import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';

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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/rrg/reject]', err);
    return NextResponse.json({ error: 'Failed to reject submission' }, { status: 500 });
  }
}
