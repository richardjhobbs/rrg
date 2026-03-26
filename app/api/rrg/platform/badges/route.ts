/**
 * GET /api/rrg/platform/badges?wallet=0x...
 * GET /api/rrg/platform/badges?submission_id=uuid
 * GET /api/rrg/platform/badges?token_id=123
 *
 * Public endpoint returning all badges for a wallet/submission.
 * Includes both World ID verification and platform attestations.
 * Used by the DropBadges component and the embeddable script.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getVerification } from '@/lib/rrg/worldid';
import { getAttestationsForWallet } from '@/lib/rrg/platforms';
import { lookupAgentIdByWallet } from '@/lib/rrg/erc8004';
import { db } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

const WALLET_RE = /^0x[0-9a-f]{40}$/i;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    let wallet = params.get('wallet')?.trim() || null;
    const submissionId = params.get('submission_id')?.trim() || null;
    const tokenId = params.get('token_id')?.trim() || null;

    // Resolve wallet from token_id or submission_id if needed
    if (!wallet && tokenId) {
      const { data } = await db
        .from('rrg_submissions')
        .select('creator_wallet')
        .eq('token_id', parseInt(tokenId, 10))
        .single();
      wallet = data?.creator_wallet || null;
    }
    if (!wallet && submissionId) {
      const { data } = await db
        .from('rrg_submissions')
        .select('creator_wallet')
        .eq('id', submissionId)
        .single();
      wallet = data?.creator_wallet || null;
    }

    if (!wallet || !WALLET_RE.test(wallet)) {
      return NextResponse.json(
        { error: 'Provide wallet, submission_id, or token_id parameter' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const lowerWallet = wallet.toLowerCase();

    // Fetch World ID, ERC-8004, and platform attestations in parallel
    const [worldVerification, erc8004AgentId, platformBadges] = await Promise.all([
      getVerification(lowerWallet),
      lookupAgentIdByWallet(lowerWallet),
      getAttestationsForWallet(lowerWallet),
    ]);

    const badges: any[] = [];

    // World ID badge
    if (worldVerification) {
      badges.push({
        type: 'worldid',
        name: 'World ID',
        slug: 'worldid',
        accentColor: '#06b6d4', // cyan-500
        verifiedAt: worldVerification.verified_at,
        humanId: worldVerification.human_id,
      });
    }

    // ERC-8004 badge
    if (erc8004AgentId !== null) {
      const knownId = erc8004AgentId > 0n;
      const idNum = knownId ? Number(erc8004AgentId) : undefined;
      badges.push({
        type: 'erc8004',
        name: knownId ? `8004 #${idNum}` : 'ERC-8004',
        slug: 'erc8004',
        accentColor: '#f59e0b', // amber-500
        agentId: idNum,
        scanUrl: knownId ? `https://8004scan.io/agent/${idNum}` : 'https://8004scan.io',
      });
    }

    // Platform badges
    for (const pb of platformBadges) {
      badges.push({
        type: 'platform',
        name: pb.platformName,
        slug: pb.platformSlug,
        logoUrl: pb.logoUrl,
        accentColor: pb.accentColor,
        websiteUrl: pb.websiteUrl,
        attestationType: pb.attestationType,
        createdAt: pb.createdAt,
      });
    }

    const response = NextResponse.json({
      wallet: lowerWallet,
      badges,
    });

    // Cache + CORS
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=60'
    );
    for (const [k, v] of Object.entries(corsHeaders())) {
      response.headers.set(k, v);
    }

    return response;
  } catch (err) {
    console.error('[/api/rrg/platform/badges]', err);
    return NextResponse.json(
      { error: 'Badge lookup failed.' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
