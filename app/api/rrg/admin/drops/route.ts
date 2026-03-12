import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

// PATCH /api/rrg/admin/drops — super-admin: edit a drop's title, price, edition_size
export async function PATCH(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get('rrg_admin_token')?.value;
  if (token !== process.env.RRG_ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { submissionId, title, price_usdc, edition_size, description } = await req.json();
    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (price_usdc !== undefined) {
      const p = parseFloat(price_usdc);
      if (isNaN(p) || p <= 0) return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
      updates.price_usdc = p;
    }
    if (edition_size !== undefined) {
      const e = parseInt(edition_size, 10);
      if (isNaN(e) || e < 1) return NextResponse.json({ error: 'Invalid edition size' }, { status: 400 });
      updates.edition_size = e;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await db
      .from('rrg_submissions')
      .update(updates)
      .eq('id', submissionId)
      .eq('status', 'approved');

    if (error) throw error;

    return NextResponse.json({ ok: true, updated: Object.keys(updates) });
  } catch (err) {
    console.error('[/api/rrg/admin/drops]', err);
    return NextResponse.json({ error: 'Failed to update drop' }, { status: 500 });
  }
}
