import { NextRequest, NextResponse } from 'next/server';
import { requireBrandAuth } from '@/lib/rrg/brand-auth';
import { db, getBrandSalesStats } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

// GET /api/brand/[brandId]/sales — brand sales + distribution data
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const stats = await getBrandSalesStats(brandId);

    // Get recent distributions for this brand
    const { data: distributions, error } = await db
      .from('rrg_distributions')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ stats, distributions: distributions || [] });
  } catch (err) {
    console.error('[/api/brand/[brandId]/sales]', err);
    return NextResponse.json({ error: 'Failed to fetch sales' }, { status: 500 });
  }
}
