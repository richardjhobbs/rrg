/**
 * POST /api/rrg/admin/marketing/outreach
 * Send outreach to a candidate or batch of candidates.
 *
 * Body:
 *   { candidate_id, channel, message_type }         — single
 *   { tier, channel, limit }                        — batch
 *
 * GET /api/rrg/admin/marketing/outreach?candidate_id=...
 * View outreach history for a candidate.
 */

import { NextResponse } from 'next/server';
import { isAdminFromCookies } from '@/lib/rrg/auth';
import { sendOutreach, batchOutreach } from '@/lib/rrg/marketing-outreach';
import { getOutreachForCandidate } from '@/lib/rrg/marketing-db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const isAdmin = await isAdminFromCookies();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    // Batch mode
    if (body.tier) {
      const results = await batchOutreach(
        body.tier,
        body.channel ?? 'manual',
        Math.min(body.limit ?? 10, 50),
      );
      return NextResponse.json({
        ok: true,
        mode: 'batch',
        sent: results.filter((r) => r.status === 'sent').length,
        failed: results.filter((r) => r.status === 'failed').length,
        results,
      });
    }

    // Single mode
    if (!body.candidate_id) {
      return NextResponse.json(
        { error: 'candidate_id required (or use tier for batch mode)' },
        { status: 400 },
      );
    }

    const result = await sendOutreach(
      body.candidate_id,
      body.channel ?? 'manual',
      body.message_type ?? 'intro',
    );

    return NextResponse.json({ ok: result.status === 'sent', ...result });
  } catch (err) {
    console.error('[marketing/outreach] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Outreach failed' },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const isAdmin = await isAdminFromCookies();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const candidateId = url.searchParams.get('candidate_id');

  if (!candidateId) {
    return NextResponse.json({ error: 'candidate_id query param required' }, { status: 400 });
  }

  const history = await getOutreachForCandidate(candidateId);
  return NextResponse.json({ outreach: history });
}
