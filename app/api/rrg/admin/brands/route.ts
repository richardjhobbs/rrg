import { NextResponse } from 'next/server';
import { getAllBrands } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';

export const dynamic = 'force-dynamic';

// GET /api/rrg/admin/brands — list all brands (super-admin only)
export async function GET() {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const brands = await getAllBrands();
    return NextResponse.json({ brands });
  } catch (err) {
    console.error('[/api/rrg/admin/brands]', err);
    return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
  }
}
