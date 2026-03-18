import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

// GET /api/rrg/admin/monitor — health check for cron monitoring
// Protected by MONITOR_SECRET header
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-monitor-secret');
  if (!secret || secret !== process.env.MONITOR_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const issues: string[] = [];

  try {
    // Failed distributions in last 48h
    const { data: failedPayouts } = await db
      .from('rrg_distributions')
      .select('id, submission_id, amount, created_at')
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());

    if (failedPayouts && failedPayouts.length > 0) {
      issues.push(`${failedPayouts.length} failed payout(s) in last 48h`);
    }

    // Stuck pending submissions (pending > 2 hours)
    const { data: stuckPending } = await db
      .from('rrg_submissions')
      .select('id, title, created_at')
      .eq('status', 'pending')
      .lte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

    if (stuckPending && stuckPending.length > 0) {
      issues.push(`${stuckPending.length} submission(s) stuck in pending > 2h`);
    }

    // Stuck pending purchases (pending > 30 min — payment submitted but not confirmed)
    const { data: stuckPurchases } = await db
      .from('rrg_purchases')
      .select('id, token_id, created_at')
      .eq('status', 'pending')
      .lte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

    if (stuckPurchases && stuckPurchases.length > 0) {
      issues.push(`${stuckPurchases.length} purchase(s) stuck in pending > 30min`);
    }

    return NextResponse.json({
      ok: issues.length === 0,
      issues,
      checked_at: new Date().toISOString(),
      counts: {
        failed_payouts: failedPayouts?.length ?? 0,
        stuck_submissions: stuckPending?.length ?? 0,
        stuck_purchases: stuckPurchases?.length ?? 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      issues: [`DB error: ${err.message}`],
      checked_at: new Date().toISOString(),
    }, { status: 500 });
  }
}
