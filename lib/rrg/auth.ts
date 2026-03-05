import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

export function isAdmin(req?: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;

  // Check cookie (browser sessions)
  const cookieStore = req
    ? req.cookies.get('admin_token')?.value
    : undefined;

  // For route handlers we use next/headers
  return cookieStore === secret;
}

export async function isAdminFromCookies(): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const cookieStore = await cookies();
  return cookieStore.get('admin_token')?.value === secret;
}

export function adminUnauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
