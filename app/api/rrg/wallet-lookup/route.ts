import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rrg/wallet-lookup?email=user@example.com
 *
 * Checks both rrg_contributors (creators) and agent_agents for an existing
 * wallet linked to this email. Returns the wallet and which system it's from.
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ found: false });
  }

  // Check creator table
  const { data: creator } = await db
    .from('rrg_contributors')
    .select('wallet_address, display_name')
    .eq('email', email)
    .limit(1)
    .single();

  // Check agent table
  const { data: agent } = await db
    .from('agent_agents')
    .select('wallet_address, name')
    .eq('email', email)
    .limit(1)
    .single();

  if (creator || agent) {
    return NextResponse.json({
      found: true,
      wallet: creator?.wallet_address || agent?.wallet_address,
      source: creator ? 'creator' : 'agent',
      name: creator?.display_name || agent?.name,
      // If both exist, confirm they match
      bothExist: !!(creator && agent),
      walletMatch: creator && agent ? creator.wallet_address === agent.wallet_address : null,
    });
  }

  return NextResponse.json({ found: false });
}
