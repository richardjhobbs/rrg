/**
 * POST /api/rrg/admin/marketing/auto-scan
 *
 * Autonomous marketing scan — runs ALL oracles sequentially, then optionally
 * triggers batch outreach to hot/warm leads.
 *
 * Authentication: CRON_SECRET header or admin cookie/header.
 * Designed to be called by cron (Vercel cron, external cron, or scheduled task).
 *
 * Query params / body:
 *   skip_outreach=true  — scan only, don't send outreach
 *   outreach_limit=10   — max outreach messages per tier (default 10)
 *
 * Cron usage (curl):
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" \
 *     https://realrealgenuine.com/api/rrg/admin/marketing/auto-scan
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAdminFromCookies } from '@/lib/rrg/auth';
import {
  scanRnwy,
  scanMcpRegistry,
  scanAg0,
  scanClawPlaza,
} from '@/lib/rrg/marketing-oracles';
import { pruneDiscoveryRuns } from '@/lib/rrg/marketing-db';
import { batchOutreach } from '@/lib/rrg/marketing-outreach';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for full scan

interface OracleResult {
  oracle: string;
  agents_scanned: number;
  new_candidates: number;
  updated_candidates: number;
  errors: number;
  duration_ms: number;
  error?: string;
}

async function checkAuth(req: NextRequest): Promise<boolean> {
  // Cron secret (primary for automated calls)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const header = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
    if (header === cronSecret) return true;
  }
  // Admin secret via header
  const adminSecret = process.env.ADMIN_SECRET;
  const adminHeader = req.headers.get('x-admin-secret');
  if (adminSecret && adminHeader === adminSecret) return true;
  // Cookie auth
  return isAdminFromCookies();
}

async function runOracleSafe(
  name: string,
  fn: () => Promise<{ agentsScanned: number; newCandidates: number; updatedCandidates: number; errors: string[] }>,
): Promise<OracleResult> {
  const start = Date.now();
  try {
    const result = await fn();
    return {
      oracle: name,
      agents_scanned: result.agentsScanned,
      new_candidates: result.newCandidates,
      updated_candidates: result.updatedCandidates,
      errors: result.errors.length,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    console.error(`[auto-scan] ${name} failed:`, err);
    return {
      oracle: name,
      agents_scanned: 0,
      new_candidates: 0,
      updated_candidates: 0,
      errors: 1,
      duration_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const body = await req.json().catch(() => ({}));
  const skipOutreach = body.skip_outreach !== false && req.nextUrl.searchParams.get('skip_outreach') !== 'false';
  // Default: skip outreach (scan-only mode). Set skip_outreach=false to enable.
  const outreachLimit = Math.min(
    Number(body.outreach_limit || req.nextUrl.searchParams.get('outreach_limit') || 10),
    50,
  );

  console.log('[auto-scan] Starting autonomous marketing scan...');

  // ── Run all oracles sequentially (to avoid rate limit issues) ───────
  const results: OracleResult[] = [];

  // 1. RNWY Explorer — Base chain agents
  results.push(await runOracleSafe('rnwy_base', () => scanRnwy('base', 200, 1)));

  // 2. RNWY Explorer — Ethereum chain agents
  results.push(await runOracleSafe('rnwy_ethereum', () => scanRnwy('ethereum', 100, 1)));

  // 3. MCP Registry — creative/design tools
  results.push(await runOracleSafe('mcp_registry_creative', () =>
    scanMcpRegistry('image art creative design generate', 50)));

  // 4. MCP Registry — commerce/marketplace tools
  results.push(await runOracleSafe('mcp_registry_commerce', () =>
    scanMcpRegistry('nft marketplace commerce token mint', 50)));

  // 5. ag0 Subgraph — all chains
  results.push(await runOracleSafe('ag0_all', () => scanAg0('all', 200)));

  // 6. ClawPlaza / IACP — recent jobs
  results.push(await runOracleSafe('clawplaza', () => scanClawPlaza(200, true)));

  // ── Auto-prune old discovery runs ───────────────────────────────────
  const pruned = await pruneDiscoveryRuns(50).catch(() => 0);

  // ── Aggregate stats ─────────────────────────────────────────────────
  const totals = {
    agents_scanned: results.reduce((s, r) => s + r.agents_scanned, 0),
    new_candidates: results.reduce((s, r) => s + r.new_candidates, 0),
    updated_candidates: results.reduce((s, r) => s + r.updated_candidates, 0),
    errors: results.reduce((s, r) => s + r.errors, 0),
    oracles_run: results.length,
    oracles_succeeded: results.filter(r => !r.error).length,
  };

  console.log(
    `[auto-scan] Scan complete: ${totals.agents_scanned} scanned, ` +
    `${totals.new_candidates} new, ${totals.updated_candidates} updated, ` +
    `${totals.errors} errors, ${pruned} runs pruned`,
  );

  // ── Optional: batch outreach to hot + warm leads ────────────────────
  let outreachResults: Record<string, unknown> | null = null;

  if (!skipOutreach && totals.new_candidates > 0) {
    console.log(`[auto-scan] Running outreach (limit ${outreachLimit} per tier)...`);
    try {
      const hotResults = await batchOutreach('hot', 'a2a', Math.min(outreachLimit, 20));
      const warmResults = await batchOutreach('warm', 'a2a', outreachLimit);

      outreachResults = {
        hot: {
          total: hotResults.length,
          delivered: hotResults.filter(r => r.status === 'delivered').length,
          sent: hotResults.filter(r => r.status === 'sent').length,
          failed: hotResults.filter(r => r.status === 'failed').length,
        },
        warm: {
          total: warmResults.length,
          delivered: warmResults.filter(r => r.status === 'delivered').length,
          sent: warmResults.filter(r => r.status === 'sent').length,
          failed: warmResults.filter(r => r.status === 'failed').length,
        },
      };

      console.log(`[auto-scan] Outreach complete: hot=${hotResults.length}, warm=${warmResults.length}`);
    } catch (outErr) {
      console.error('[auto-scan] Outreach failed:', outErr);
      outreachResults = { error: outErr instanceof Error ? outErr.message : String(outErr) };
    }
  }

  const totalDuration = Date.now() - startTime;

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    duration_ms: totalDuration,
    duration_human: `${(totalDuration / 1000).toFixed(1)}s`,
    scan: {
      totals,
      oracles: results,
      pruned_runs: pruned,
    },
    outreach: outreachResults,
  });
}

// GET returns scan status / info
export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    endpoint: '/api/rrg/admin/marketing/auto-scan',
    description: 'Autonomous marketing scan — runs all oracles + optional outreach',
    method: 'POST',
    authentication: [
      'x-cron-secret header (for cron jobs)',
      'x-admin-secret header',
      'admin_token cookie',
    ],
    oracles: ['rnwy_base', 'rnwy_ethereum', 'mcp_registry_creative', 'mcp_registry_commerce', 'ag0_all', 'clawplaza'],
    options: {
      skip_outreach: 'boolean — scan only, no outreach (default: false)',
      outreach_limit: 'number — max outreach per tier (default: 10, max: 50)',
    },
    cron_setup: {
      vercel: 'Add to vercel.json: { "crons": [{ "path": "/api/rrg/admin/marketing/auto-scan", "schedule": "0 8 * * *" }] }',
      external: 'curl -X POST -H "x-cron-secret: $CRON_SECRET" https://realrealgenuine.com/api/rrg/admin/marketing/auto-scan',
    },
  });
}
