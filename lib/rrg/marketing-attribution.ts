/**
 * Agent Marketing System — Attribution Tracker
 *
 * Fire-and-forget functions that hook into existing RRG routes.
 * When an agent performs an action (connects, submits, purchases, registers),
 * we check if they're a known candidate and record the conversion.
 *
 * All functions are non-blocking — errors are logged but never propagate.
 */

import { db } from './db';
import {
  type ConversionAction,
  getCandidateByWallet,
  recordConversion,
  createCommission,
  getMarketingAgentByWallet,
  getOutreachForCandidate,
} from './marketing-db';

// ── Constants ──────────────────────────────────────────────────────────────

const DRHOBBS_WALLET = '0xe653804032A2d51Cc031795afC601B9b1fd2c375';

// ── Core Attribution Logic ─────────────────────────────────────────────────

/**
 * Check if a wallet belongs to a known candidate agent and record the conversion.
 * Called fire-and-forget from MCP connect, submit, purchase, and brand registration routes.
 *
 * @param wallet    - The agent/buyer wallet address
 * @param action    - What they did
 * @param actionRef - Reference ID (submission_id, tx_hash, brand_id, etc.)
 * @param revenueUsdc - Revenue generated (0 for non-revenue actions)
 */
async function trackAttribution(
  wallet: string,
  action: ConversionAction,
  actionRef: string | null,
  revenueUsdc: number,
): Promise<void> {
  try {
    const normalWallet = wallet.toLowerCase();

    // Skip our own wallets
    if (normalWallet === DRHOBBS_WALLET.toLowerCase()) return;

    // Is this wallet a known candidate?
    const candidate = await getCandidateByWallet(normalWallet);
    if (!candidate) return; // Not a candidate — nothing to attribute

    // Get DrHobbs (or whichever marketing agent discovered this candidate)
    const marketingAgentId = candidate.discovered_by;
    if (!marketingAgentId) return; // No marketing agent to credit

    // Find the most recent outreach to this candidate (for attribution linking)
    const outreachHistory = await getOutreachForCandidate(candidate.id);
    const lastOutreach = outreachHistory.length > 0 ? outreachHistory[0] : null;

    // Determine attribution type
    let attribution: 'direct' | 'assisted' | 'organic' = 'organic';
    if (lastOutreach) {
      const outreachAge = Date.now() - new Date(lastOutreach.created_at).getTime();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      if (outreachAge < thirtyDays) {
        // Was there a reply? Direct attribution. No reply? Assisted.
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

    // Update candidate outreach status
    await db
      .from('mkt_candidates')
      .update({
        outreach_status: 'converted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidate.id);

    // If there's revenue, create a commission record
    if (revenueUsdc > 0 && conversion) {
      // Get marketing agent's commission rate
      const { data: mktAgent } = await db
        .from('mkt_agents')
        .select('commission_bps')
        .eq('id', marketingAgentId)
        .single();

      const commissionBps = mktAgent?.commission_bps ?? 1000;
      const commissionUsdc = (revenueUsdc * commissionBps) / 10000;

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

      // Increment marketing agent totals (read-modify-write)
      const { data: agentData } = await db
        .from('mkt_agents')
        .select('total_conversions, total_commission_usdc')
        .eq('id', marketingAgentId)
        .single();

      if (agentData) {
        await db
          .from('mkt_agents')
          .update({
            total_conversions: agentData.total_conversions + 1,
            total_commission_usdc: parseFloat(String(agentData.total_commission_usdc)) + commissionUsdc,
            updated_at: new Date().toISOString(),
          })
          .eq('id', marketingAgentId);
      }
    } else if (conversion) {
      // Non-revenue conversion — still update count
      const { data: agentData } = await db
        .from('mkt_agents')
        .select('total_conversions')
        .eq('id', marketingAgentId)
        .single();

      if (agentData) {
        await db
          .from('mkt_agents')
          .update({
            total_conversions: agentData.total_conversions + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', marketingAgentId);
      }
    }

    console.log(
      `[marketing] conversion: ${action} by ${normalWallet.slice(0, 10)}… ` +
      `(${attribution}, revenue: $${revenueUsdc})`,
    );
  } catch (err) {
    // Never propagate — this is fire-and-forget
    console.error('[marketing] attribution error:', err);
  }
}

// ── Public Fire-and-Forget Hooks ───────────────────────────────────────────

/**
 * Call when an agent submits a design (MCP or REST).
 * Non-blocking — safe to call without await.
 */
export function fireSubmitAttribution(
  creatorWallet: string,
  submissionId: string,
): void {
  trackAttribution(creatorWallet, 'submit_design', submissionId, 0).catch(() => {});
}

/**
 * Call when an agent purchases a drop.
 * Non-blocking — safe to call without await.
 *
 * @param revenueUsdc - The platform's share of the purchase (for commission calc)
 */
export function firePurchaseAttribution(
  buyerWallet: string,
  txHash: string,
  revenueUsdc: number,
): void {
  trackAttribution(buyerWallet, 'purchase', txHash, revenueUsdc).catch(() => {});
}

/**
 * Call when an agent registers a brand.
 * Non-blocking — safe to call without await.
 */
export function fireBrandAttribution(
  wallet: string,
  brandId: string,
): void {
  trackAttribution(wallet, 'register_brand', brandId, 0).catch(() => {});
}

/**
 * Call when an agent connects via MCP (first tool call).
 * Non-blocking — safe to call without await.
 */
export function fireMcpConnectAttribution(wallet: string): void {
  trackAttribution(wallet, 'mcp_connect', null, 0).catch(() => {});
}

/**
 * Call when an agent browses (list_drops, list_brands, etc.).
 * Non-blocking — only records if the wallet is a known candidate.
 */
export function fireBrowseAttribution(wallet: string): void {
  trackAttribution(wallet, 'browse', null, 0).catch(() => {});
}
