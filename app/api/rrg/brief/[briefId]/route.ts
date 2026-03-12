import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';

export const dynamic = 'force-dynamic';

// PATCH /api/rrg/brief/[briefId] — admin update brief
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ briefId: string }> }
) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();
  const { briefId } = await params;

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.ends_at !== undefined) updates.ends_at = body.ends_at || null;
    if (body.status !== undefined) updates.status = body.status;

    if (body.is_current !== undefined) {
      updates.is_current = body.is_current;
      // If setting as current, deactivate others for same brand
      if (body.is_current) {
        const { data: brief } = await db
          .from('rrg_briefs')
          .select('brand_id')
          .eq('id', briefId)
          .single();
        if (brief) {
          await db
            .from('rrg_briefs')
            .update({ is_current: false })
            .eq('is_current', true)
            .eq('brand_id', brief.brand_id);
        }
        updates.status = 'active';
      }
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
    console.error('[/api/rrg/brief/[briefId] PATCH]', err);
    return NextResponse.json({ error: 'Failed to update brief' }, { status: 500 });
  }
}

// DELETE /api/rrg/brief/[briefId] — admin delete brief
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ briefId: string }> }
) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();
  const { briefId } = await params;

  try {
    const { error } = await db
      .from('rrg_briefs')
      .delete()
      .eq('id', briefId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/rrg/brief/[briefId] DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete brief' }, { status: 500 });
  }
}
