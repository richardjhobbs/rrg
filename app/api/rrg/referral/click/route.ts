/**
 * POST /api/rrg/referral/click — Record a referral link click
 *
 * Public endpoint (no auth required). Called from the ReferralCapture
 * client component when a drop page loads with ?ref=xxx.
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordReferralClick } from '@/lib/rrg/referral';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { referralCode, tokenId } = await req.json();

    if (!referralCode || typeof referralCode !== 'string') {
      return NextResponse.json({ error: 'referralCode required' }, { status: 400 });
    }

    // Get IP for dedup (from headers, never stored raw — hashed in recordReferralClick)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown';

    const userAgent = req.headers.get('user-agent') ?? undefined;

    // Fire-and-forget — don't block on this
    recordReferralClick(
      referralCode,
      tokenId ? parseInt(tokenId) : undefined,
      ip,
      userAgent,
    ).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
