/**
 * GET /api/rrg/admin/marketing/dashboard
 * High-level marketing system stats.
 */

import { NextResponse } from 'next/server';
import { isAdminFromCookies } from '@/lib/rrg/auth';
import {
  getMarketingDashboardStats,
  getActiveMarketingAgents,
} from '@/lib/rrg/marketing-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const isAdmin = await isAdminFromCookies();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [stats, agents] = await Promise.all([
    getMarketingDashboardStats(),
    getActiveMarketingAgents(),
  ]);

  return NextResponse.json({
    marketing_agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      erc8004_id: a.erc8004_id,
      commission_bps: a.commission_bps,
      total_candidates_found: a.total_candidates_found,
      total_outreach_sent: a.total_outreach_sent,
      total_conversions: a.total_conversions,
      total_commission_usdc: a.total_commission_usdc,
    })),
    pipeline: stats,
  });
}
