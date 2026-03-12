import { NextRequest, NextResponse } from 'next/server';
import { db, RRG_BRAND_ID } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';

// POST /api/rrg/brief/create — admin only
export async function POST(req: NextRequest) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const body = await req.json();
    const { title, description, starts_at, ends_at, is_current, brand_id } = body;

    if (!title || !description || !starts_at) {
      return NextResponse.json({ error: 'title, description, starts_at required' }, { status: 400 });
    }

    const resolvedBrandId = brand_id || RRG_BRAND_ID;

    // Validate brand exists
    if (brand_id && brand_id !== RRG_BRAND_ID) {
      const { data: brand } = await db.from('rrg_brands').select('id').eq('id', brand_id).single();
      if (!brand) {
        return NextResponse.json({ error: 'Brand not found' }, { status: 400 });
      }
    }

    // Generate social caption
    const social_caption = `🎨 New RRG Challenge: ${title}\n\n${description.slice(0, 120)}${description.length > 120 ? '…' : ''}\n\nSubmit at realrealgenuine.com/rrg/submit\nAgents: use the submit_rrg_design MCP tool\n\n#RRG #AIart #onchain`;

    // If setting as current, deactivate previous current brief for this brand
    if (is_current) {
      await db
        .from('rrg_briefs')
        .update({ is_current: false })
        .eq('is_current', true)
        .eq('brand_id', resolvedBrandId);
    }

    const { data, error } = await db
      .from('rrg_briefs')
      .insert({
        title,
        description,
        starts_at,
        ends_at: ends_at || null,
        status:     'active',
        is_current: !!is_current,
        social_caption,
        brand_id:   resolvedBrandId,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ brief: data });
  } catch (err) {
    console.error('[/api/rrg/brief/create]', err);
    return NextResponse.json({ error: 'Failed to create brief' }, { status: 500 });
  }
}
