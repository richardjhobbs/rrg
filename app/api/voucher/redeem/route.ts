import { NextRequest, NextResponse } from 'next/server';
import { redeemVoucher, getVoucherByCode, formatVoucherForDisplay } from '@/lib/rrg/vouchers';
import { fireVoucherSignal } from '@/lib/rrg/erc8004';
import { db } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

// POST /api/voucher/redeem — redeem a voucher by code
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, redeemed_by } = body;

    if (!code) {
      return NextResponse.json({ error: 'Voucher code is required' }, { status: 400 });
    }

    const result = await redeemVoucher(
      code,
      redeemed_by || 'web-user',
      req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    );

    if (!result.success) {
      const messages: Record<string, string> = {
        not_found:          'Voucher code not found.',
        already_redeemed:   'This voucher has already been redeemed.',
        expired:            'This voucher has expired.',
        cancelled:          'This voucher has been cancelled.',
        redemption_failed:  'Redemption failed. Please try again.',
      };
      return NextResponse.json(
        { error: messages[result.error ?? ''] ?? 'Redemption failed.' },
        { status: 400 }
      );
    }

    const display = await formatVoucherForDisplay(result.voucher!);

    // Fire ERC-8004 voucher_redeemed signal (non-blocking)
    // Look up the submission to get tokenId
    const { data: submission } = await db
      .from('rrg_submissions')
      .select('token_id')
      .eq('id', result.voucher!.submission_id)
      .single();
    if (submission?.token_id) {
      fireVoucherSignal({
        buyerWallet: result.voucher!.buyer_wallet,
        voucherCode: result.voucher!.code,
        brandId:     result.voucher!.brand_id,
        tokenId:     submission.token_id,
        signalType:  'voucher_redeemed',
      });
    }

    return NextResponse.json({
      success: true,
      voucher: {
        code:       result.voucher!.code,
        status:     'redeemed',
        offer:      display?.offer ?? null,
        terms:      display?.terms ?? null,
        brand_url:  display?.brand_url ?? null,
        expires_at: result.voucher!.expires_at,
      },
    });
  } catch (err) {
    console.error('[/api/voucher/redeem]', err);
    return NextResponse.json({ error: 'Redemption failed' }, { status: 500 });
  }
}
