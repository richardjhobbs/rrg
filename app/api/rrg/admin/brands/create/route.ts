import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';

export const dynamic = 'force-dynamic';

// POST /api/rrg/admin/brands/create — create a new brand (super-admin only)
export async function POST(req: NextRequest) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const body = await req.json();
    const { name, slug, contact_email, wallet_address, description, headline, website_url } = body;

    if (!name || !slug || !contact_email || !wallet_address) {
      return NextResponse.json(
        { error: 'name, slug, contact_email, wallet_address required' },
        { status: 400 }
      );
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet_address)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json({ error: 'Slug must be lowercase alphanumeric with hyphens' }, { status: 400 });
    }

    const { data, error } = await db
      .from('rrg_brands')
      .insert({
        name,
        slug: slug.toLowerCase(),
        contact_email,
        wallet_address: wallet_address.toLowerCase(),
        description: description || null,
        headline: headline || null,
        website_url: website_url || null,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // unique violation
        return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ brand: data }, { status: 201 });
  } catch (err) {
    console.error('[/api/rrg/admin/brands/create]', err);
    return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 });
  }
}
