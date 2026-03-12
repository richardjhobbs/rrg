import { NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { requireCreatorAuth } from '@/lib/rrg/creator-auth';

export const dynamic = 'force-dynamic';

// GET /api/creator/earnings — list creator's revenue distributions with tx hashes
export async function GET() {
  const auth = await requireCreatorAuth();
  if ('error' in auth) return auth.error;

  const { profile } = auth;

  const { data, error } = await db
    .from('rrg_distributions')
    .select('id, created_at, total_usdc, creator_usdc, brand_usdc, platform_usdc, split_type, status, notes, brand_id')
    .eq('creator_wallet', profile.walletAddress)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[/api/creator/earnings]', error);
    return NextResponse.json({ error: 'Failed to fetch earnings' }, { status: 500 });
  }

  // Parse tx hashes from notes (format: "creator:0xabc... | brand:0xdef...")
  const distributions = (data ?? []).map((d) => {
    let creatorTxHash: string | null = null;
    if (d.notes) {
      const match = d.notes.match(/creator:(0x[a-fA-F0-9]{64})/);
      if (match) creatorTxHash = match[1];
    }
    return { ...d, creatorTxHash };
  });

  // Summary totals
  const totals = distributions.reduce(
    (acc, d) => ({
      totalEarned:   acc.totalEarned + parseFloat(d.creator_usdc ?? '0'),
      totalPending:  acc.totalPending + (d.status === 'pending' ? parseFloat(d.creator_usdc ?? '0') : 0),
      totalPaid:     acc.totalPaid + (d.status === 'completed' ? parseFloat(d.creator_usdc ?? '0') : 0),
      totalSales:    acc.totalSales + 1,
    }),
    { totalEarned: 0, totalPending: 0, totalPaid: 0, totalSales: 0 },
  );

  return NextResponse.json({ distributions, totals });
}
