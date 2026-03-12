import { NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { requireCreatorAuth } from '@/lib/rrg/creator-auth';

export const dynamic = 'force-dynamic';

// GET /api/creator/drops — list creator's approved drops with sales data
export async function GET() {
  const auth = await requireCreatorAuth();
  if ('error' in auth) return auth.error;

  const { profile } = auth;

  // Get approved submissions (drops)
  const { data: drops, error } = await db
    .from('rrg_submissions')
    .select('id, title, token_id, edition_size, price_usdc, brand_id, approved_at, created_at')
    .eq('creator_wallet', profile.walletAddress)
    .eq('status', 'approved')
    .not('token_id', 'is', null)
    .order('approved_at', { ascending: false });

  if (error) {
    console.error('[/api/creator/drops]', error);
    return NextResponse.json({ error: 'Failed to fetch drops' }, { status: 500 });
  }

  // Get purchase counts and revenue per token
  const tokenIds = (drops ?? []).map((d) => d.token_id).filter(Boolean);
  const salesMap: Record<number, { count: number; revenue: number }> = {};

  if (tokenIds.length > 0) {
    const { data: purchases } = await db
      .from('rrg_purchases')
      .select('token_id, amount_usdc')
      .in('token_id', tokenIds);

    for (const p of purchases ?? []) {
      if (!salesMap[p.token_id]) salesMap[p.token_id] = { count: 0, revenue: 0 };
      salesMap[p.token_id].count++;
      salesMap[p.token_id].revenue += parseFloat(p.amount_usdc ?? '0');
    }
  }

  // Enrich with brand names
  const brandIds = [...new Set((drops ?? []).map((d) => d.brand_id).filter(Boolean))];
  const brandMap: Record<string, string> = {};
  if (brandIds.length > 0) {
    const { data: brands } = await db.from('rrg_brands').select('id, name').in('id', brandIds);
    for (const b of brands ?? []) brandMap[b.id] = b.name;
  }

  const enriched = (drops ?? []).map((d) => ({
    ...d,
    brandName:    d.brand_id ? brandMap[d.brand_id] ?? 'Unknown' : 'RRG',
    salesCount:   salesMap[d.token_id]?.count ?? 0,
    salesRevenue: salesMap[d.token_id]?.revenue ?? 0,
  }));

  return NextResponse.json({ drops: enriched });
}
