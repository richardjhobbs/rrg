import { NextRequest, NextResponse } from 'next/server';
import { requireBrandAuth } from '@/lib/rrg/brand-auth';
import { db } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

// GET /api/brand/[brandId]/briefs — list brand's briefs
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const { data, error } = await db
      .from('rrg_briefs')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return NextResponse.json({ briefs: data ?? [] });
  } catch (err) {
    console.error('[/api/brand/[brandId]/briefs GET]', err);
    return NextResponse.json({ error: 'Failed to fetch briefs' }, { status: 500 });
  }
}

// POST /api/brand/[brandId]/briefs — create a new brief
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const body = await req.json();
    const { title, description, ends_at, is_current } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'title and description are required' },
        { status: 400 }
      );
    }

    if (title.length > 120) {
      return NextResponse.json({ error: 'Title must be under 120 characters' }, { status: 400 });
    }

    // If setting as current, deactivate previous current brief for this brand
    if (is_current) {
      await db
        .from('rrg_briefs')
        .update({ is_current: false })
        .eq('is_current', true)
        .eq('brand_id', brandId);
    }

    // Auto-generate social caption
    const social_caption = `🎨 New Brief: ${title}\n\n${description.slice(0, 120)}${description.length > 120 ? '…' : ''}\n\nSubmit at realrealgenuine.com\n\n#RRG #AIart #onchain`;

    const { data, error } = await db
      .from('rrg_briefs')
      .insert({
        title,
        description,
        starts_at: new Date().toISOString(),
        ends_at: ends_at || null,
        status: 'active',
        is_current: !!is_current,
        social_caption,
        brand_id: brandId,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ brief: data });
  } catch (err) {
    console.error('[/api/brand/[brandId]/briefs POST]', err);
    return NextResponse.json({ error: 'Failed to create brief' }, { status: 500 });
  }
}

// PATCH /api/brand/[brandId]/briefs — update a brief (close, archive, set current)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const body = await req.json();
    const { briefId, action, title, description, ends_at } = body;

    if (!briefId) {
      return NextResponse.json({ error: 'briefId required' }, { status: 400 });
    }

    // Verify the brief belongs to this brand
    const { data: existing } = await db
      .from('rrg_briefs')
      .select('id, brand_id')
      .eq('id', briefId)
      .eq('brand_id', brandId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (action === 'close') {
      updates.status = 'closed';
      updates.is_current = false;
    } else if (action === 'archive') {
      updates.status = 'archived';
      updates.is_current = false;
    } else if (action === 'activate') {
      updates.status = 'active';
    } else if (action === 'set_current') {
      // Deactivate previous current brief for this brand
      await db
        .from('rrg_briefs')
        .update({ is_current: false })
        .eq('is_current', true)
        .eq('brand_id', brandId);
      updates.is_current = true;
      updates.status = 'active';
    } else {
      // Field updates
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (ends_at !== undefined) updates.ends_at = ends_at || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid updates' }, { status: 400 });
    }

    const { data, error } = await db
      .from('rrg_briefs')
      .update(updates)
      .eq('id', briefId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ brief: data });
  } catch (err) {
    console.error('[/api/brand/[brandId]/briefs PATCH]', err);
    return NextResponse.json({ error: 'Failed to update brief' }, { status: 500 });
  }
}
