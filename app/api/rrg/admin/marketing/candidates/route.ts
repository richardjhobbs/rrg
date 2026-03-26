/**
 * GET /api/rrg/admin/marketing/candidates
 * List candidate agents with filtering and pagination.
 *
 * Query params:
 *   tier=hot|warm|cold|disqualified
 *   outreach=pending|contacted|engaged|converted|declined|unresponsive
 *   source=chain_scan|mcp_log|manual|referral|registry
 *   min_score=0-100
 *   page=1
 *   per_page=25
 */

import { NextResponse } from 'next/server';
import { isAdminFromCookies } from '@/lib/rrg/auth';
import {
  getCandidatesPaginated,
  type CandidateTier,
  type OutreachStatus,
  type DiscoverySource,
} from '@/lib/rrg/marketing-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const isAdmin = await isAdminFromCookies();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') ?? '25', 10)));

  const filters: {
    tier?: CandidateTier;
    outreach_status?: OutreachStatus;
    discovery_source?: DiscoverySource;
    min_score?: number;
    chain?: string;
    reachable?: boolean;
  } = {};

  const tier = url.searchParams.get('tier');
  if (tier) filters.tier = tier as CandidateTier;

  const outreach = url.searchParams.get('outreach');
  if (outreach) filters.outreach_status = outreach as OutreachStatus;

  const source = url.searchParams.get('source');
  if (source) filters.discovery_source = source as DiscoverySource;

  const minScore = url.searchParams.get('min_score');
  if (minScore) filters.min_score = parseInt(minScore, 10);

  const chain = url.searchParams.get('chain');
  if (chain) filters.chain = chain;

  const reachable = url.searchParams.get('reachable');
  if (reachable === 'true') filters.reachable = true;
  else if (reachable === 'false') filters.reachable = false;

  const { candidates, totalCount } = await getCandidatesPaginated(page, perPage, filters);

  return NextResponse.json({
    candidates,
    pagination: {
      page,
      per_page: perPage,
      total: totalCount,
      pages: Math.ceil(totalCount / perPage),
    },
  });
}
