import { NextRequest, NextResponse } from 'next/server';
import { getUsdcBalance } from '@/lib/agent/contract';

export const dynamic = 'force-dynamic';

/** GET /api/agent/wallet/balance?address=0x... — USDC balance */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
  }

  try {
    const balance = await getUsdcBalance(address);
    return NextResponse.json({ address, balance_usdc: balance });
  } catch (err) {
    console.error('Balance check error:', err);
    return NextResponse.json({ error: 'Failed to check balance' }, { status: 500 });
  }
}
