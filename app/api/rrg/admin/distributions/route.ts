import { NextRequest, NextResponse } from 'next/server';
import { getDistributions } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';
import type { DistributionStatus } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

// GET /api/rrg/admin/distributions?status=pending — list distributions (super-admin only)
export async function GET(req: NextRequest) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const statusParam = req.nextUrl.searchParams.get('status') as DistributionStatus | null;
    const distributions = await getDistributions(statusParam ?? undefined);
    return NextResponse.json({ distributions });
  } catch (err) {
    console.error('[/api/rrg/admin/distributions]', err);
    return NextResponse.json({ error: 'Failed to fetch distributions' }, { status: 500 });
  }
}
