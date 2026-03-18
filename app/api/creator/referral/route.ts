/**
 * POST /api/creator/referral — Register as a referral partner
 * GET  /api/creator/referral — Get partner stats + commissions
 *
 * Requires creator auth.
 */

import { NextResponse } from 'next/server';
import { requireCreatorAuth } from '@/lib/rrg/creator-auth';
import { registerPartner, getPartnerByCreatorId, getPartnerStats } from '@/lib/rrg/referral';

export const dynamic = 'force-dynamic';

// POST — opt in as a referral partner
export async function POST() {
  const auth = await requireCreatorAuth();
  if ('error' in auth) return auth.error;

  const { profile } = auth;

  const partner = await registerPartner(profile.id, profile.walletAddress);
  if (!partner) {
    return NextResponse.json({ error: 'Failed to register as partner' }, { status: 500 });
  }

  return NextResponse.json({
    partner: {
      id: partner.id,
      referralCode: partner.referral_code,
      status: partner.status,
      commissionRate: `${partner.commission_bps / 100}%`,
      walletAddress: partner.wallet_address,
    },
  });
}

// GET — get partner stats and commission history
export async function GET() {
  const auth = await requireCreatorAuth();
  if ('error' in auth) return auth.error;

  const { profile } = auth;

  const partner = await getPartnerByCreatorId(profile.id);
  if (!partner) {
    return NextResponse.json({ registered: false });
  }

  const stats = await getPartnerStats(partner.id);
  if (!stats) {
    return NextResponse.json({ registered: false });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realrealgenuine.com';

  return NextResponse.json({
    registered: true,
    partner: {
      id: stats.partner.id,
      referralCode: stats.partner.referral_code,
      status: stats.partner.status,
      commissionRate: `${stats.partner.commission_bps / 100}%`,
      walletAddress: stats.partner.wallet_address,
      totalClicks: stats.partner.total_clicks,
      totalConversions: stats.partner.total_conversions,
      totalCommissionUsdc: parseFloat(String(stats.partner.total_commission_usdc)),
      pendingUsdc: stats.pendingUsdc,
      paidUsdc: stats.paidUsdc,
      conversionRate: stats.partner.total_clicks > 0
        ? parseFloat((stats.partner.total_conversions / stats.partner.total_clicks * 100).toFixed(1))
        : 0,
    },
    linkTemplate: `${siteUrl}/rrg/drop/{tokenId}?ref=${stats.partner.referral_code}`,
    commissions: stats.commissions.map(c => ({
      id: c.id,
      date: c.created_at,
      revenueUsdc: parseFloat(String(c.revenue_usdc)),
      commissionUsdc: parseFloat(String(c.commission_usdc)),
      status: c.status,
      notes: c.notes,
    })),
  });
}
