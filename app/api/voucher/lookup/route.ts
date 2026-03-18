import { NextRequest, NextResponse } from 'next/server';
import {
  getVoucherByCode, getVoucherByRedemptionToken,
  getTemplateById, formatVoucherForDisplay,
} from '@/lib/rrg/vouchers';
import { getBrandById } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

// GET /api/voucher/lookup?code=RRG-XXXX-XXXX or ?token=abc123
export async function GET(req: NextRequest) {
  try {
    const code  = req.nextUrl.searchParams.get('code');
    const token = req.nextUrl.searchParams.get('token');

    if (!code && !token) {
      return NextResponse.json({ error: 'Provide code or token parameter' }, { status: 400 });
    }

    const voucher = code
      ? await getVoucherByCode(code)
      : await getVoucherByRedemptionToken(token!);

    if (!voucher) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 });
    }

    const template = await getTemplateById(voucher.template_id);
    const brand    = await getBrandById(voucher.brand_id);
    const display  = await formatVoucherForDisplay(voucher);

    // Check real-time expiry
    const isExpired = new Date(voucher.expires_at) < new Date();
    const effectiveStatus = isExpired && voucher.status === 'active' ? 'expired' : voucher.status;

    return NextResponse.json({
      voucher: {
        code:        voucher.code,
        status:      effectiveStatus,
        offer:       display?.offer ?? template?.title ?? null,
        terms:       display?.terms ?? null,
        brand_url:   display?.brand_url ?? null,
        expires_at:  voucher.expires_at,
        redeemed_at: voucher.redeemed_at,
        brand: brand ? { name: brand.name, slug: brand.slug } : null,
        template: template ? {
          title:        template.title,
          description:  template.description,
          voucher_type: template.voucher_type,
          voucher_value: template.voucher_value,
        } : null,
      },
    });
  } catch (err) {
    console.error('[/api/voucher/lookup]', err);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
