import { NextResponse } from 'next/server';
import { isAdminFromCookies } from '@/lib/rrg/auth';

export const dynamic = 'force-dynamic';

// GET /api/rrg/admin/check
export async function GET() {
  const authenticated = await isAdminFromCookies();
  return NextResponse.json({ authenticated });
}
