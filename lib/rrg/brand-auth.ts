/**
 * Brand admin authentication via Supabase Auth (email/password).
 *
 * Completely separate from the super-admin ADMIN_SECRET cookie auth.
 * Brand admins authenticate via sb-access-token / sb-refresh-token cookies.
 */

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from './db';

// ── Supabase client for auth operations (uses anon key for client-side auth) ──
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
);

// ── Supabase admin client (uses service key for admin user management) ──
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_KEY ?? 'placeholder-key',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export { supabaseAdmin };

// ── Types ───────────────────────────────────────────────────────────────

export type BrandRole = 'admin' | 'viewer';

export interface BrandUser {
  id: string;
  email: string;
}

export interface BrandMembership {
  brandId: string;
  brandName: string;
  brandSlug: string;
  role: BrandRole;
}

// ── Cookie management ───────────────────────────────────────────────────

const ACCESS_TOKEN_COOKIE  = 'sb-access-token';
const REFRESH_TOKEN_COOKIE = 'sb-refresh-token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

export function setBrandAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, COOKIE_OPTIONS);
  response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, COOKIE_OPTIONS);
}

export function clearBrandAuthCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 });
  response.cookies.set(REFRESH_TOKEN_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 });
}

// ── Auth helpers ────────────────────────────────────────────────────────

/**
 * Read brand user from cookies. Returns null if not authenticated.
 */
export async function getBrandUser(): Promise<BrandUser | null> {
  const cookieStore = await cookies();
  const accessToken  = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken) return null;

  // Verify the token by getting the user
  const { data, error } = await supabaseAuth.auth.getUser(accessToken);

  if (error || !data.user) {
    // Try refreshing the token
    if (refreshToken) {
      const { data: refreshData, error: refreshError } =
        await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });

      if (!refreshError && refreshData.user) {
        return {
          id: refreshData.user.id,
          email: refreshData.user.email ?? '',
        };
      }
    }
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? '',
  };
}

/**
 * Get all brands a user is a member of.
 */
export async function getUserBrands(userId: string): Promise<BrandMembership[]> {
  const { data, error } = await db
    .from('rrg_brand_members')
    .select(`
      role,
      brand:rrg_brands!inner(id, name, slug)
    `)
    .eq('user_id', userId);

  if (error || !data) return [];

  return data.map((row: Record<string, unknown>) => {
    const brand = row.brand as Record<string, unknown>;
    return {
      brandId:   brand.id as string,
      brandName: brand.name as string,
      brandSlug: brand.slug as string,
      role:      row.role as BrandRole,
    };
  });
}

/**
 * Check if a user is an admin for a specific brand.
 */
export async function isBrandAdmin(userId: string, brandId: string): Promise<boolean> {
  const { data } = await db
    .from('rrg_brand_members')
    .select('id')
    .eq('user_id', userId)
    .eq('brand_id', brandId)
    .eq('role', 'admin')
    .maybeSingle();

  return !!data;
}

/**
 * Middleware helper: require brand admin auth for a route.
 * Returns the authenticated user or a 401 response.
 */
export async function requireBrandAuth(
  brandId: string,
): Promise<{ user: BrandUser } | { error: NextResponse }> {
  const user = await getBrandUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }

  const isAdmin = await isBrandAdmin(user.id, brandId);
  if (!isAdmin) {
    return { error: NextResponse.json({ error: 'Not authorized for this brand' }, { status: 403 }) };
  }

  return { user };
}
