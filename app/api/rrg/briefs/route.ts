import { NextRequest, NextResponse } from 'next/server';
import { getRecentBriefs, db } from '@/lib/rrg/db';
import { isAdminFromCookies } from '@/lib/rrg/auth';

export const dynamic = 'force-dynamic';

// GET /api/rrg/briefs — public: recent briefs (6), or admin: all briefs with brand names
export async function GET(req: NextRequest) {
  try {
    const admin = req.nextUrl.searchParams.get('admin') === '1';

    if (admin && (await isAdminFromCookies())) {
      // Return all briefs with brand name for admin view
      const { data, error } = await db
        .from('rrg_briefs')
        .select('*, brand:rrg_brands!inner(name, slug)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return NextResponse.json({ briefs: data ?? [] });
    }

    const briefs = await getRecentBriefs(6);
    return NextResponse.json({ briefs });
  } catch (err) {
    console.error('[/api/rrg/briefs]', err);
    return NextResponse.json({ error: 'Failed to fetch briefs' }, { status: 500 });
  }
}
