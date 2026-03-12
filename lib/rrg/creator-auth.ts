/**
 * Creator authentication via Supabase Auth (email/password).
 *
 * Shares Supabase Auth with brand-auth (same cookie pair), but checks
 * rrg_creator_members instead of rrg_brand_members.
 */

import { NextResponse } from 'next/server';
import { getBrandUser, type BrandUser } from './brand-auth';
import { db } from './db';

// Re-export the shared user type
export type CreatorUser = BrandUser;

export interface CreatorProfile {
  id: string;
  userId: string;
  walletAddress: string;
  displayName: string | null;
  creatorType: 'human' | 'agent';
  role: string;
  email: string;
  createdAt: string;
}

/**
 * Read the authenticated user from cookies (shared with brand auth).
 */
export async function getCreatorUser(): Promise<CreatorUser | null> {
  return getBrandUser();
}

/**
 * Get creator profile for an authenticated user.
 */
export async function getCreatorProfile(userId: string): Promise<CreatorProfile | null> {
  const { data, error } = await db
    .from('rrg_creator_members')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id:            data.id,
    userId:        data.user_id,
    walletAddress: data.wallet_address,
    displayName:   data.display_name,
    creatorType:   data.creator_type,
    role:          data.role,
    email:         '', // filled by caller from auth user
    createdAt:     data.created_at,
  };
}

/**
 * Middleware: require creator auth. Returns user + profile or 401.
 */
export async function requireCreatorAuth(): Promise<
  { user: CreatorUser; profile: CreatorProfile } | { error: NextResponse }
> {
  const user = await getCreatorUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }

  const profile = await getCreatorProfile(user.id);
  if (!profile) {
    return { error: NextResponse.json({ error: 'No creator account found' }, { status: 403 }) };
  }

  profile.email = user.email;
  return { user, profile };
}
