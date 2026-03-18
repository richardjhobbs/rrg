/**
 * RRG Brand-Agent Trust — tracking trust relationships
 *
 * Auto-escalates trust level based on transaction count:
 *   0-2 transactions  → standard
 *   3-9 transactions  → trusted
 *   10+ transactions  → premium
 *
 * Brands can manually override to 'suspended' via admin.
 */

import { db } from './db';

// ── Types ────────────────────────────────────────────────────────────────

export type TrustLevel = 'standard' | 'trusted' | 'premium' | 'suspended';

export interface BrandAgentTrust {
  id: string;
  brand_id: string;
  agent_wallet: string;
  trust_level: TrustLevel;
  transaction_count: number;
  total_spend_usdc: number;
  last_transaction_at: string | null;
  created_at: string;
}

export interface AgentStanding {
  agent_wallet: string;
  total_brands: number;
  total_transactions: number;
  total_spend_usdc: number;
  brands: {
    brand_id: string;
    trust_level: TrustLevel;
    transaction_count: number;
    total_spend_usdc: number;
  }[];
}

// ── Trust Level Calculation ──────────────────────────────────────────────

function calculateTrustLevel(txCount: number, currentLevel: TrustLevel): TrustLevel {
  // Never auto-upgrade from suspended
  if (currentLevel === 'suspended') return 'suspended';
  if (txCount >= 10) return 'premium';
  if (txCount >= 3) return 'trusted';
  return 'standard';
}

// ── Core Functions ───────────────────────────────────────────────────────

/**
 * Get or create a trust record for a brand-agent pair.
 * Returns the existing record or a new 'standard' one.
 */
export async function getOrCreateTrust(
  brandId: string,
  agentWallet: string
): Promise<BrandAgentTrust> {
  const wallet = agentWallet.toLowerCase();

  // Try to get existing
  const { data: existing } = await db
    .from('rrg_brand_agent_trust')
    .select('*')
    .eq('brand_id', brandId)
    .eq('agent_wallet', wallet)
    .single();

  if (existing) return existing as BrandAgentTrust;

  // Create new
  const { data, error } = await db
    .from('rrg_brand_agent_trust')
    .insert({
      brand_id:     brandId,
      agent_wallet: wallet,
      trust_level:  'standard',
    })
    .select()
    .single();

  if (error) throw error;
  return data as BrandAgentTrust;
}

/**
 * Increment trust after a successful purchase/redemption.
 * Auto-escalates trust level based on new transaction count.
 */
export async function incrementTrust(
  brandId: string,
  agentWallet: string,
  amountUsdc: number
): Promise<BrandAgentTrust> {
  const trust = await getOrCreateTrust(brandId, agentWallet);

  const newTxCount = trust.transaction_count + 1;
  const newSpend   = parseFloat(String(trust.total_spend_usdc)) + amountUsdc;
  const newLevel   = calculateTrustLevel(newTxCount, trust.trust_level);

  const { data, error } = await db
    .from('rrg_brand_agent_trust')
    .update({
      transaction_count:   newTxCount,
      total_spend_usdc:    newSpend.toFixed(2),
      last_transaction_at: new Date().toISOString(),
      trust_level:         newLevel,
    })
    .eq('id', trust.id)
    .select()
    .single();

  if (error) throw error;
  return data as BrandAgentTrust;
}

/**
 * Get aggregated standing for an agent across all brands.
 */
export async function getAgentStanding(agentWallet: string): Promise<AgentStanding> {
  const wallet = agentWallet.toLowerCase();

  const { data, error } = await db
    .from('rrg_brand_agent_trust')
    .select('*')
    .eq('agent_wallet', wallet);

  if (error) throw error;
  const records = (data ?? []) as BrandAgentTrust[];

  return {
    agent_wallet:       wallet,
    total_brands:       records.length,
    total_transactions: records.reduce((sum, r) => sum + r.transaction_count, 0),
    total_spend_usdc:   records.reduce((sum, r) => sum + parseFloat(String(r.total_spend_usdc)), 0),
    brands: records.map(r => ({
      brand_id:          r.brand_id,
      trust_level:       r.trust_level,
      transaction_count: r.transaction_count,
      total_spend_usdc:  parseFloat(String(r.total_spend_usdc)),
    })),
  };
}

/**
 * Manually set trust level (brand admin action).
 */
export async function setTrustLevel(
  brandId: string,
  agentWallet: string,
  level: TrustLevel
): Promise<BrandAgentTrust> {
  const trust = await getOrCreateTrust(brandId, agentWallet);

  const { data, error } = await db
    .from('rrg_brand_agent_trust')
    .update({ trust_level: level })
    .eq('id', trust.id)
    .select()
    .single();

  if (error) throw error;
  return data as BrandAgentTrust;
}
