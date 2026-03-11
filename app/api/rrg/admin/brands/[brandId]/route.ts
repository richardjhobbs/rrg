import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';

export const dynamic = 'force-dynamic';

// PATCH /api/rrg/admin/brands/[brandId] — update brand settings (super-admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const { brandId } = await params;
    const body = await req.json();

    // Allowed update fields
    const updates: Record<string, unknown> = {};
    const allowed = [
      'name', 'slug', 'description', 'headline', 'logo_path', 'banner_path',
      'website_url', 'social_links', 'contact_email', 'wallet_address',
      'status', 'max_self_listings',
    ];

    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Validate wallet if provided
    if (updates.wallet_address && !/^0x[0-9a-fA-F]{40}$/.test(updates.wallet_address as string)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const { data, error } = await db
      .from('rrg_brands')
      .update(updates)
      .eq('id', brandId)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    return NextResponse.json({ brand: data });
  } catch (err) {
    console.error('[/api/rrg/admin/brands/[brandId]]', err);
    return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 });
  }
}
