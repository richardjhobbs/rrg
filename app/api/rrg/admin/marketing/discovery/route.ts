/**
 * POST /api/rrg/admin/marketing/discovery
 * Trigger an ERC-8004 registry scan to discover candidate agents.
 * Accepts { chain, start_id, max_scan }.
 * Large scans run in the background — returns immediately with the run ID.
 *
 * GET /api/rrg/admin/marketing/discovery
 * View recent discovery runs + their status + available chains.
 */

import { NextResponse } from 'next/server';
import { isAdminFromCookies } from '@/lib/rrg/auth';
import {
  runDiscoveryScan,
  getLastScannedId,
  CHAIN_CONFIGS,
  type SupportedChain,
} from '@/lib/rrg/marketing-discovery';
import { getRecentDiscoveryRuns } from '@/lib/rrg/marketing-db';

export const dynamic = 'force-dynamic';

// Background scan threshold — anything above this runs async
const SYNC_LIMIT = 200;

export async function POST(req: Request) {
  const isAdmin = await isAdminFromCookies();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const chain: SupportedChain = body.chain ?? 'base';

    // Validate chain
    if (!CHAIN_CONFIGS[chain]) {
      return NextResponse.json({ error: `Unknown chain: ${chain}` }, { status: 400 });
    }

    const startId = body.start_id ?? (await getLastScannedId(chain)) + 1;
    const maxScan = Math.min(body.max_scan ?? 200, 30000);

    if (maxScan <= SYNC_LIMIT) {
      // Small scan — run synchronously and return results
      const result = await runDiscoveryScan(chain, startId, maxScan);
      return NextResponse.json({
        ok: true,
        mode: 'sync',
        chain,
        run_id: result.runId,
        agents_scanned: result.agentsScanned,
        new_candidates: result.newCandidates,
        updated_candidates: result.updatedCandidates,
        errors: result.errors.length,
        error_details: result.errors.slice(0, 10),
      });
    }

    // Large scan — fire and forget, return immediately
    runDiscoveryScan(chain, startId, maxScan)
      .then((result) => {
        console.log(
          `[marketing/discovery] ${chain} background scan complete: ` +
          `${result.agentsScanned} scanned, ${result.newCandidates} new, ` +
          `${result.updatedCandidates} updated, ${result.errors.length} errors`,
        );
      })
      .catch((err) => {
        console.error(`[marketing/discovery] ${chain} background scan failed:`, err);
      });

    return NextResponse.json({
      ok: true,
      mode: 'background',
      chain,
      message: `${CHAIN_CONFIGS[chain].name} scan started in background: IDs ${startId} to ${startId + maxScan}. Check Discovery Runs for progress.`,
      start_id: startId,
      max_scan: maxScan,
    });
  } catch (err) {
    console.error('[marketing/discovery] scan failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Discovery scan failed' },
      { status: 500 },
    );
  }
}

export async function GET() {
  const isAdmin = await isAdminFromCookies();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const runs = await getRecentDiscoveryRuns(30);

  return NextResponse.json({
    runs,
    chains: CHAIN_CONFIGS,
  });
}
