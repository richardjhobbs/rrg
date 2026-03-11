import { NextRequest, NextResponse } from 'next/server';
import { requireBrandAuth } from '@/lib/rrg/brand-auth';
import { getBrandById, db } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

// GET /api/brand/[brandId]/settings — get brand profile
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const brand = await getBrandById(brandId);
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }
    return NextResponse.json({ brand });
  } catch (err) {
    console.error('[/api/brand/[brandId]/settings GET]', err);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// PATCH /api/brand/[brandId]/settings — update limited brand profile fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const body = await req.json();

    // Brand admins can only update these fields (not wallet, status, max_self_listings)
    const updates: Record<string, unknown> = {};
    const allowed = ['name', 'description', 'headline', 'website_url', 'social_links', 'contact_email'];

    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await db
      .from('rrg_brands')
      .update(updates)
      .eq('id', brandId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ brand: data });
  } catch (err) {
    console.error('[/api/brand/[brandId]/settings PATCH]', err);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
