import { NextResponse } from 'next/server';
import { clearBrandAuthCookies } from '@/lib/rrg/brand-auth';

export const dynamic = 'force-dynamic';

// POST /api/creator/auth/logout — clear session cookies
export async function POST() {
  const response = NextResponse.json({ success: true });
  clearBrandAuthCookies(response);
  return response;
}
