/**
 * POST /api/rrg/admin/marketing/oracles
 * Trigger an oracle scan (RNWY, MCP Registry, etc.)
 * Accepts { oracle, chain?, search?, limit?, page?, min_score? }
 *
 * GET /api/rrg/admin/marketing/oracles
 * List available oracles and their configs.
 */

import { NextResponse } from 'next/server';
import { isAdminFromCookies } from '@/lib/rrg/auth';
import {
  scanRnwy,
  scanMcpRegistry,
  scanAg0,
  scanClawPlaza,
  ORACLE_CONFIGS,
} from '@/lib/rrg/marketing-oracles';
import { pruneDiscoveryRuns } from '@/lib/rrg/marketing-db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const isAdmin = await isAdminFromCookies();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const oracle: string = body.oracle;

    if (!oracle) {
      return NextResponse.json({ error: 'Missing "oracle" field' }, { status: 400 });
    }

    const config = ORACLE_CONFIGS.find(o => o.id === oracle);
    if (!config) {
      return NextResponse.json(
        { error: `Unknown oracle: ${oracle}. Available: ${ORACLE_CONFIGS.map(o => o.id).join(', ')}` },
        { status: 400 },
      );
    }

    let result;

    switch (oracle) {
      case 'rnwy': {
        const chain = body.chain ?? 'base';
        const limit = Math.min(body.limit ?? 100, 500);
        const page = body.page ?? 1;
        const minScore = body.min_score ?? undefined;
        result = await scanRnwy(chain, limit, page, minScore);
        break;
      }

      case 'mcp_registry': {
        const search = body.search ?? 'image art creative design generate';
        const limit = Math.min(body.limit ?? 50, 96);
        result = await scanMcpRegistry(search, limit);
        break;
      }

      case 'ag0_sdk': {
        const chain = body.chain ?? 'all';
        const limit = Math.min(body.limit ?? 100, 500);
        const filters: Record<string, unknown> = {};
        if (body.name) filters.name = body.name;
        if (body.active !== undefined) filters.active = body.active;
        if (body.mcp_tools) filters.mcpTools = body.mcp_tools;
        if (body.a2a_skills) filters.a2aSkills = body.a2a_skills;
        if (body.x402support !== undefined) filters.x402support = body.x402support;
        if (body.min_feedback) filters.minFeedback = body.min_feedback;
        result = await scanAg0(chain, limit, Object.keys(filters).length > 0 ? filters as never : undefined);
        break;
      }

      case 'clawplaza': {
        const maxJobs = Math.min(body.max_jobs ?? 200, 1000);
        const startFromEnd = body.start_from_end !== false;
        result = await scanClawPlaza(maxJobs, startFromEnd);
        break;
      }

      default:
        return NextResponse.json({ error: `Oracle "${oracle}" not yet implemented` }, { status: 400 });
    }

    // Auto-prune old discovery runs (keep 50 per source)
    const pruned = await pruneDiscoveryRuns(50).catch(() => 0);

    return NextResponse.json({
      ok: true,
      oracle,
      run_id: result.runId,
      source: result.source,
      agents_scanned: result.agentsScanned,
      new_candidates: result.newCandidates,
      updated_candidates: result.updatedCandidates,
      errors: result.errors.length,
      error_details: result.errors.slice(0, 10),
      pruned_runs: pruned,
    });
  } catch (err) {
    console.error('[marketing/oracles] scan failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Oracle scan failed' },
      { status: 500 },
    );
  }
}

export async function GET() {
  const isAdmin = await isAdminFromCookies();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ oracles: ORACLE_CONFIGS });
}
