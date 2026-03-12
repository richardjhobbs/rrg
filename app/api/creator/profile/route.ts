import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { requireCreatorAuth } from '@/lib/rrg/creator-auth';

export const dynamic = 'force-dynamic';

// GET /api/creator/profile — get creator profile
export async function GET() {
  const auth = await requireCreatorAuth();
  if ('error' in auth) return auth.error;

  const { profile } = auth;

  // Also fetch contributor stats
  const { data: contributor } = await db
    .from('rrg_contributors')
    .select('total_submissions, total_approved, total_rejected, total_revenue_usdc, bio, brands_contributed')
    .eq('wallet_address', profile.walletAddress)
    .maybeSingle();

  return NextResponse.json({
    profile,
    stats: contributor ?? {
      total_submissions: 0,
      total_approved: 0,
      total_rejected: 0,
      total_revenue_usdc: '0',
      bio: null,
      brands_contributed: [],
    },
  });
}

// PATCH /api/creator/profile — update creator profile
export async function PATCH(req: NextRequest) {
  const auth = await requireCreatorAuth();
  if ('error' in auth) return auth.error;

  const { profile } = auth;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.displayName !== undefined) updates.display_name = body.displayName;

  if (Object.keys(updates).length > 0) {
    await db
      .from('rrg_creator_members')
      .update(updates)
      .eq('id', profile.id);
  }

  // Update contributor record too
  const contribUpdates: Record<string, unknown> = {};
  if (body.displayName !== undefined) contribUpdates.display_name = body.displayName;
  if (body.bio !== undefined) contribUpdates.bio = body.bio;

  if (Object.keys(contribUpdates).length > 0) {
    await db
      .from('rrg_contributors')
      .update(contribUpdates)
      .eq('wallet_address', profile.walletAddress);
  }

  return NextResponse.json({ success: true });
}
