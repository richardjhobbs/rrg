import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

/** GET /api/rrg/creator-check?wallet=0x... - Check if wallet is a registered creator */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ exists: false });
  }

  const { data } = await db
    .from('rrg_contributors')
    .select('wallet_address, display_name, email')
    .eq('wallet_address', wallet.toLowerCase())
    .single();

  if (data) {
    return NextResponse.json({
      exists: true,
      displayName: data.display_name,
      email: data.email,
    });
  }

  return NextResponse.json({ exists: false });
}
