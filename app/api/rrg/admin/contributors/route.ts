import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAllContributors, getContributorStats } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

// GET /api/rrg/admin/contributors — super-admin: list all contributors + stats
export async function GET() {
  const jar = await cookies();
  const token = jar.get('rrg_admin_token')?.value;
  if (token !== process.env.RRG_ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [contributors, stats] = await Promise.all([
      getAllContributors(),
      getContributorStats(),
    ]);

    return NextResponse.json({ contributors, stats });
  } catch (err) {
    console.error('[/api/rrg/admin/contributors]', err);
    return NextResponse.json({ error: 'Failed to fetch contributors' }, { status: 500 });
  }
}
