/**
 * POST /api/rrg/world-verify
 *   Triggers on-chain AgentBook verification for a wallet.
 *   Body: { wallet_address: string }
 *
 * GET /api/rrg/world-verify?wallet=0x...
 *   Checks cached verification status (DB only, no chain call).
 *
 * Both return: { verified: boolean, humanId?: string, verifiedAt?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWallet, getVerification } from '@/lib/rrg/worldid';

export const dynamic = 'force-dynamic';

const WALLET_RE = /^0x[0-9a-f]{40}$/i;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const wallet = (body.wallet_address as string)?.trim();

    if (!wallet || !WALLET_RE.test(wallet)) {
      return NextResponse.json(
        { error: 'wallet_address must be a valid 0x address' },
        { status: 400 }
      );
    }

    const result = await verifyWallet(wallet, 'api');

    if (!result) {
      return NextResponse.json({
        verified: false,
        wallet: wallet.toLowerCase(),
        message:
          'Wallet not found in AgentBook. Register at https://docs.world.org/agents to get verified.',
      });
    }

    return NextResponse.json({
      verified: true,
      wallet: wallet.toLowerCase(),
      humanId: result.human_id,
      verifiedAt: result.verified_at,
    });
  } catch (err) {
    console.error('[/api/rrg/world-verify POST]', err);
    return NextResponse.json(
      { error: 'Verification failed. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get('wallet')?.trim();

    if (!wallet || !WALLET_RE.test(wallet)) {
      return NextResponse.json(
        { error: 'wallet query parameter must be a valid 0x address' },
        { status: 400 }
      );
    }

    const result = await getVerification(wallet);

    const response = result
      ? NextResponse.json({
          verified: true,
          wallet: wallet.toLowerCase(),
          humanId: result.human_id,
          verifiedAt: result.verified_at,
        })
      : NextResponse.json({
          verified: false,
          wallet: wallet.toLowerCase(),
        });

    // 5-minute cache (matches ERC-8004 badge pattern)
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=60'
    );

    return response;
  } catch (err) {
    console.error('[/api/rrg/world-verify GET]', err);
    return NextResponse.json(
      { error: 'Verification check failed.' },
      { status: 500 }
    );
  }
}
