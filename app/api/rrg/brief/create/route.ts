import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';

// POST /api/rrg/brief/create — admin only
export async function POST(req: NextRequest) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const body = await req.json();
    const { title, description, starts_at, ends_at, is_current } = body;

    if (!title || !description || !starts_at) {
      return NextResponse.json({ error: 'title, description, starts_at required' }, { status: 400 });
    }

    // Generate social caption
    const social_caption = `🎨 New RRG Challenge: ${title}\n\n${description.slice(0, 120)}${description.length > 120 ? '…' : ''}\n\nSubmit at richard-hobbs.com/rrg/submit\nAgents: use the submit_rrg_design MCP tool\n\n#RRG #AIart #onchain`;

    // If setting as current, deactivate previous current brief
    if (is_current) {
      await db
        .from('rrg_briefs')
        .update({ is_current: false })
        .eq('is_current', true);
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
