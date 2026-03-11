import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';

export const dynamic = 'force-dynamic';

// PATCH /api/rrg/admin/distributions/[id] — mark distribution completed (super-admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const { id } = await params;
    const body = await req.json();
    const { status, notes } = body;

    if (!status || !['completed', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'status must be "completed" or "failed"' }, { status: 400 });
    }

    const { data, error } = await db
      .from('rrg_distributions')
      .update({
        status,
        notes: notes || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Distribution not found' }, { status: 404 });
    }

    return NextResponse.json({ distribution: data });
  } catch (err) {
    console.error('[/api/rrg/admin/distributions/[id]]', err);
    return NextResponse.json({ error: 'Failed to update distribution' }, { status: 500 });
  }
}
