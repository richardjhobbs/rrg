/**
 * GET /api/rrg/agent-trust
 * Returns live ERC-8004 identity data for DrHobbs (Agent ID 17666).
 * Reads directly from Base mainnet — no third-party dependency.
 * Cached for 5 minutes so it's cheap to embed in the UI.
 */

import { NextResponse } from 'next/server';
import { getAgentUri, DRHOBBS_AGENT_ID } from '@/lib/rrg/erc8004';

export const dynamic  = 'force-dynamic';
export const revalidate = 300; // 5 min ISR cache

const PROFILE_URL = `https://8004scan.io/agents/base/${DRHOBBS_AGENT_ID}`;
const EXPECTED_URI = 'https://richard-hobbs.com/agent.json';

export async function GET() {
  try {
    const tokenUri = await getAgentUri();

    return NextResponse.json(
      {
        agentId:    DRHOBBS_AGENT_ID.toString(),
        network:    'base',
        registered: true,
        tokenUri,
        uriCurrent: tokenUri === EXPECTED_URI,
        profileUrl: PROFILE_URL,
        contract:   '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (err) {
    console.error('[agent-trust]', err);
    return NextResponse.json(
      { registered: false, error: 'Failed to read registry' },
      { status: 200 } // return 200 so badge degrades gracefully
    );
  }
}
