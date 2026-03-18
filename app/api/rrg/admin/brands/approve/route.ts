import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';
import { sendBrandApprovalEmail } from '@/lib/rrg/email';

export const dynamic = 'force-dynamic';

// POST /api/rrg/admin/brands/approve — approve a pending brand
export async function POST(req: NextRequest) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const { brandId } = await req.json();
    if (!brandId) {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }

    const { data, error } = await db
      .from('rrg_brands')
      .update({ status: 'active' })
      .eq('id', brandId)
      .eq('status', 'pending')
      .select('id, name, slug, contact_email')
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Brand not found or not in pending status' },
        { status: 404 },
      );
    }

    // Send approval email (non-blocking)
    if (data.contact_email) {
      sendBrandApprovalEmail({
        to: data.contact_email,
        brandName: data.name,
        brandSlug: data.slug,
      }).catch((err) => console.error('[brand/approve] email failed:', err));
    }

    return NextResponse.json({
      message: `Brand "${data.name}" approved and now active`,
      brand: data,
    });
  } catch (err) {
    console.error('[admin/brands/approve]', err);
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 });
  }
}
