/**
 * Agent Marketing System — Attribution Tracker
 *
 * Functions that hook into existing RRG routes to track conversions.
 * When an agent performs an action (connects, submits, purchases, registers),
 * we check if they're a known candidate and record the conversion.
 *
 * Fire-and-forget wrappers are provided for non-critical paths,
 * but trackAttribution() itself returns errors for observability.
 */

import { db } from './db';
import {
  type ConversionAction,
  getCandidateByWallet,
  recordConversion,
  createCommission,
  getOutreachForCandidate,
} from './marketing-db';

// ── Constants ──────────────────────────────────────────────────────────────

const DRHOBBS_WALLET = '0xe653804032A2d51Cc031795afC601B9b1fd2c375';

// ── Attribution Result ────────────────────────────────────────────────────

export interface AttributionResult {
  tracked: boolean;
  reason: string;         // 'converted' | 'not_candidate' | 'no_marketing_agent' | 'error:...'
  conversionId?: string;
  commissionUsdc?: number;
}

// ── Core Attribution Logic ─────────────────────────────────────────────────

/**
 * Check if a wallet belongs to a known candidate agent and record the conversion.
 * Returns a result object instead of swallowing errors.
 *
 * @param wallet    - The agent/buyer wallet address
 * @param action    - What they did
 * @param actionRef - Reference ID (submission_id, tx_hash, brand_id, etc.)
 * @param revenueUsdc - PLATFORM SHARE of revenue only (0 for non-revenue actions).
 *                      Commission (1000 bps = 10%) is calculated on this amount, NOT the total sale price.
 */
async function trackAttribution(
  wallet: string,
  action: ConversionAction,
  actionRef: string | null,
  revenueUsdc: number,
): Promise<AttributionResult> {
  const normalWallet = wallet.toLowerCase();

  // Skip our own wallets
  if (normalWallet === DRHOBBS_WALLET.toLowerCase()) {
    return { tracked: false, reason: 'own_wallet' };
  }

  // Is this wallet a known candidate?
  const candidate = await getCandidateByWallet(normalWallet);
  if (!candidate) return { tracked: false, reason: 'not_candidate' };

  // Get the marketing agent who discovered this candidate
  const marketingAgentId = candidate.discovered_by;
  if (!marketingAgentId) return { tracked: false, reason: 'no_marketing_agent' };

  // Find the most recent outreach to this candidate (for attribution linking)
  const outreachHistory = await getOutreachForCandidate(candidate.id);
  const lastOutreach = outreachHistory.length > 0 ? outreachHistory[0] : null;

  // Determine attribution type
  let attribution: 'direct' | 'assisted' | 'organic' = 'organic';
  if (lastOutreach) {
    const outreachAge = Date.now() - new Date(lastOutreach.created_at).getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    if (outreachAge < thirtyDays) {
      attribution = lastOutreach.status === 'replied' ? 'direct' : 'assisted';
    }
  }

  // Record the conversion
  const conversion = await recordConversion({
    candidate_id: candidate.id,
    marketing_agent: marketingAgentId,
    action,
    action_ref: actionRef,
    outreach_id: lastOutreach?.id ?? null,
    attribution,
    revenue_usdc: revenueUsdc,
  });

  if (!conversion) {
    return { tracked: false, reason: 'error:conversion_insert_failed' };
  }

  // Update candidate outreach status
  await db
    .from('mkt_candidates')
    .update({
      outreach_status: 'converted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidate.id);

  let commissionUsdc = 0;

  // If there's revenue, create a commission record (idempotent on conversion_id)
  if (revenueUsdc > 0) {
    // Get marketing agent's commission rate
    const { data: mktAgent } = await db
      .from('mkt_agents')
      .select('commission_bps')
      .eq('id', marketingAgentId)
      .single();

    const commissionBps = mktAgent?.commission_bps ?? 1000;
    commissionUsdc = (revenueUsdc * commissionBps) / 10000;

    // Check for existing commission on this conversion (idempotency)
    const { data: existingCommission } = await db
      .from('mkt_commissions')
      .select('id')
      .eq('conversion_id', conversion.id)
      .eq('marketing_agent', marketingAgentId)
      .limit(1);

    if (!existingCommission || existingCommission.length === 0) {
      await createCommission({
        marketing_agent: marketingAgentId,
        conversion_id: conversion.id,
        candidate_id: candidate.id,
        revenue_usdc: revenueUsdc,
        commission_bps: commissionBps,
        commission_usdc: commissionUsdc,
        status: 'pending',
        notes: `${action} by ${normalWallet.slice(0, 10)}… — ${attribution} attribution`,
      });
    }
  }

  // Atomic increment of marketing agent totals (prevents read-modify-write race)
  // Uses Supabase RPC or raw SQL for atomic update
  if (revenueUsdc > 0) {
    await db.rpc('increment_marketing_agent_stats', {
      agent_id: marketingAgentId,
      conversion_count: 1,
      commission_amount: commissionUsdc,
    }).then(({ error }) => {
      // Fallback to read-modify-write if RPC doesn't exist yet
      if (error?.code === '42883') { // function does not exist
        return atomicIncrementFallback(marketingAgentId, 1, commissionUsdc);
      }
    });
  } else {
    await db.rpc('increment_marketing_agent_stats', {
      agent_id: marketingAgentId,
      conversion_count: 1,
      commission_amount: 0,
    }).then(({ error }) => {
      if (error?.code === '42883') {
        return atomicIncrementFallback(marketingAgentId, 1, 0);
      }
    });
  }

  console.log(
    `[marketing] conversion: ${action} by ${normalWallet.slice(0, 10)}… ` +
    `(${attribution}, revenue: $${revenueUsdc})`,
  );

  return {
    tracked: true,
    reason: 'converted',
    conversionId: conversion.id,
    commissionUsdc,
  };
}

/**
 * Fallback for when the RPC function doesn't exist yet.
 * Still uses read-modify-write but logs a warning.
 */
async function atomicIncrementFallback(
  marketingAgentId: string,
  conversionCount: number,
  commissionUsdc: number,
): Promise<void> {
  console.warn('[marketing] Using read-modify-write fallback — create increment_marketing_agent_stats RPC for atomicity');
  const { data: agentData } = await db
    .from('mkt_agents')
    .select('total_conversions, total_commission_usdc')
    .eq('id', marketingAgentId)
    .single();

  if (agentData) {
    await db
      .from('mkt_agents')
      .update({
        total_conversions: agentData.total_conversions + conversionCount,
        total_commission_usdc: parseFloat(String(agentData.total_commission_usdc)) + commissionUsdc,
        updated_at: new Date().toISOString(),
      })
      .eq('id', marketingAgentId);
  }
}

// ── Public Fire-and-Forget Hooks ───────────────────────────────────────────
// These are safe to call without await. Errors are logged, never propagated.

/**
 * Call when an agent submits a design (MCP or REST).
 * Non-blocking — safe to call without await.
 */
export function fireSubmitAttribution(
  creatorWallet: string,
  submissionId: string,
): void {
  trackAttribution(creatorWallet, 'submit_design', submissionId, 0).catch((err) => {
    console.error('[marketing] attribution error (submit):', err);
  });
}

/**
 * Call when an agent purchases a drop.
 * Non-blocking — safe to call without await.
 *
 * @param revenueUsdc - The PLATFORM'S SHARE only (split.platformUsdc), NOT the total sale price.
 */
export function firePurchaseAttribution(
  buyerWallet: string,
  txHash: string,
  revenueUsdc: number,
): void {
  trackAttribution(buyerWallet, 'purchase', txHash, revenueUsdc).catch((err) => {
    console.error('[marketing] attribution error (purchase):', err);
  });
}

/**
 * Call when an agent registers a brand.
 * Non-blocking — safe to call without await.
 */
export function fireBrandAttribution(
  wallet: string,
  brandId: string,
): void {
  trackAttribution(wallet, 'register_brand', brandId, 0).catch((err) => {
    console.error('[marketing] attribution error (brand):', err);
  });
}

/**
 * Call when an agent connects via MCP (first tool call).
 * Non-blocking — safe to call without await.
 */
export function fireMcpConnectAttribution(wallet: string): void {
  trackAttribution(wallet, 'mcp_connect', null, 0).catch((err) => {
    console.error('[marketing] attribution error (mcp_connect):', err);
  });
}

/**
 * Call when an agent browses (list_drops, list_brands, etc.).
 * Non-blocking — only records if the wallet is a known candidate.
 */
export function fireBrowseAttribution(wallet: string): void {
  trackAttribution(wallet, 'browse', null, 0).catch((err) => {
    console.error('[marketing] attribution error (browse):', err);
  });
}

/**
 * Await-able version of trackAttribution for when you need the result.
 * Use this in admin/debug routes.
 */
export async function trackAttributionAsync(
  wallet: string,
  action: ConversionAction,
  actionRef: string | null,
  revenueUsdc: number,
): Promise<AttributionResult> {
  try {
    return await trackAttribution(wallet, action, actionRef, revenueUsdc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[marketing] attribution error:', msg);
    return { tracked: false, reason: `error:${msg}` };
  }
}
