import { NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { requireCreatorAuth } from '@/lib/rrg/creator-auth';

export const dynamic = 'force-dynamic';

// GET /api/creator/submissions — list creator's submissions
export async function GET() {
  const auth = await requireCreatorAuth();
  if ('error' in auth) return auth.error;

  const { profile } = auth;

  const { data, error } = await db
    .from('rrg_submissions')
    .select('id, title, description, status, created_at, token_id, edition_size, price_usdc, brand_id, creator_type')
    .eq('creator_wallet', profile.walletAddress)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[/api/creator/submissions]', error);
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 });
  }

  // Enrich with brand names
  const brandIds = [...new Set((data ?? []).map((s) => s.brand_id).filter(Boolean))];
  const brandMap: Record<string, string> = {};
  if (brandIds.length > 0) {
    const { data: brands } = await db
      .from('rrg_brands')
      .select('id, name')
      .in('id', brandIds);
    for (const b of brands ?? []) {
      brandMap[b.id] = b.name;
    }
  }

  const submissions = (data ?? []).map((s) => ({
    ...s,
    brandName: s.brand_id ? brandMap[s.brand_id] ?? 'Unknown' : 'RRG',
  }));

  return NextResponse.json({ submissions });
}
