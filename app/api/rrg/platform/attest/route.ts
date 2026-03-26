/**
 * POST /api/rrg/platform/attest
 *
 * Partner platforms call this to attest that a wallet or submission
 * was created on their platform. Authenticated via x-api-key header.
 *
 * Body:
 *   wallet_address  string   required   0x address
 *   submission_id   string   optional   links attestation to a specific submission
 *   metadata        object   optional   freeform context (e.g. { tool: "Canvas" })
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey } from '@/lib/rrg/platforms';
import { db } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

const WALLET_RE = /^0x[0-9a-f]{40}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing x-api-key header' },
        { status: 401 }
      );
    }

    const platform = await verifyApiKey(apiKey);
    if (!platform) {
      return NextResponse.json(
        { error: 'Invalid or inactive API key' },
        { status: 401 }
      );
    }

    // ── Parse body ───────────────────────────────────────────────────
    const body = await req.json();
    const wallet = (body.wallet_address as string)?.trim();
    const submissionId = (body.submission_id as string)?.trim() || null;
    const metadata = body.metadata ?? {};

    if (!wallet || !WALLET_RE.test(wallet)) {
      return NextResponse.json(
        { error: 'wallet_address must be a valid 0x address' },
        { status: 400 }
      );
    }

    if (submissionId && !UUID_RE.test(submissionId)) {
      return NextResponse.json(
        { error: 'submission_id must be a valid UUID' },
        { status: 400 }
      );
    }

    // ── If submission_id provided, verify it exists and wallet matches ─
    if (submissionId) {
      const { data: sub } = await db
        .from('rrg_submissions')
        .select('creator_wallet')
        .eq('id', submissionId)
        .single();

      if (!sub) {
        return NextResponse.json(
          { error: 'submission_id not found' },
          { status: 404 }
        );
      }
      if (sub.creator_wallet?.toLowerCase() !== wallet.toLowerCase()) {
        return NextResponse.json(
          { error: 'wallet_address does not match the submission creator' },
          { status: 400 }
        );
      }
    }

    // ── Insert attestation (idempotent — duplicates return success) ──
    const attestationType = submissionId ? 'submission' : 'wallet';

    const { data, error } = await db
      .from('rrg_platform_attestations')
      .insert({
        platform_id: platform.id,
        wallet_address: wallet.toLowerCase(),
        submission_id: submissionId,
        attestation_type: attestationType,
        metadata,
      })
      .select()
      .single();

    if (error) {
      // Duplicate (unique index violation) — still a success
      if (error.code === '23505') {
        return NextResponse.json({
          success: true,
          platform: platform.slug,
          wallet: wallet.toLowerCase(),
          attestationType,
          message: 'Attestation already exists',
        });
      }
      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        attestationId: data.id,
        platform: platform.slug,
        wallet: wallet.toLowerCase(),
        attestationType,
        submissionId: submissionId || undefined,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[/api/rrg/platform/attest]', err);
    return NextResponse.json(
      { error: 'Attestation failed. Please try again.' },
      { status: 500 }
    );
  }
}
