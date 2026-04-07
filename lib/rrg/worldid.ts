/**
 * World AgentKit — AgentBook verification for RRG
 *
 * Checks the on-chain AgentBook registry on Base mainnet to determine
 * whether an agent wallet is backed by a verified human via World ID.
 *
 * All AgentKit SDK usage is isolated in this file.
 */

import { createAgentBookVerifier } from '@worldcoin/agentkit';
import { unstable_cache } from 'next/cache';
import { db } from './db';

// ── Verifier singleton (stateless, safe to reuse) ──────────────────────
// Default network is World Chain — where agentkit-cli registers by default.
// Also create a Base verifier as fallback for wallets registered on Base.
const worldVerifier = createAgentBookVerifier({ network: 'world' });
const baseVerifier = createAgentBookVerifier({ network: 'base' });

// ── Types ──────────────────────────────────────────────────────────────
export interface WorldVerification {
  id: string;
  wallet_address: string;
  human_id: string;
  chain_id: string;
  verified_at: string;
  expires_at: string | null;
  source: string;
}

/**
 * Look up a wallet in the on-chain AgentBook and cache the result.
 * Returns the verification record if human-backed, null otherwise.
 */
export async function verifyWallet(
  walletAddress: string,
  source: string = 'mcp'
): Promise<WorldVerification | null> {
  const wallet = walletAddress.toLowerCase();

  // Check cache first
  const existing = await getVerification(wallet);
  if (existing) return existing;

  // On-chain lookup via AgentKit SDK — try World Chain first (default), then Base
  let humanId: string | null = null;
  let resolvedChain = 'eip155:480'; // World Chain
  try {
    humanId = await worldVerifier.lookupHuman(wallet, 'eip155:480');
    if (!humanId) {
      humanId = await baseVerifier.lookupHuman(wallet, 'eip155:8453');
      if (humanId) resolvedChain = 'eip155:8453';
    }
  } catch (err) {
    console.error('[worldid] AgentBook lookup failed:', err);
    return null;
  }

  if (!humanId) return null;

  // Upsert into world_verifications
  const { data, error } = await db
    .from('world_verifications')
    .upsert(
      {
        wallet_address: wallet,
        human_id: humanId,
        chain_id: resolvedChain,
        source,
      },
      { onConflict: 'wallet_address' }
    )
    .select()
    .single();

  if (error) {
    console.error('[worldid] Supabase upsert error:', error);
    throw error;
  }

  return data as WorldVerification;
}

/**
 * Check if a wallet is already verified (DB lookup only, no chain call).
 */
export async function getVerification(
  walletAddress: string
): Promise<WorldVerification | null> {
  const { data } = await db
    .from('world_verifications')
    .select('*')
    .eq('wallet_address', walletAddress.toLowerCase())
    .single();

  return (data as WorldVerification) ?? null;
}

/**
 * Batch check: given an array of wallet addresses, return the set that are verified.
 * Used by gallery page to annotate cards without N+1 queries.
 */
export async function getVerifiedWallets(
  wallets: string[]
): Promise<Set<string>> {
  if (wallets.length === 0) return new Set();
  const cacheKey = wallets.slice().sort().join('|');
  const fetch = unstable_cache(
    async () => {
      const lower = wallets.map((w) => w.toLowerCase());
      const { data } = await db
        .from('world_verifications')
        .select('wallet_address')
        .in('wallet_address', lower);
      return (data ?? []).map((r: { wallet_address: string }) => r.wallet_address);
    },
    [`world-verified-${cacheKey}`],
    { revalidate: 300 }, // 5-min cache — verifications don't change often
  );
  const list = await fetch();
  return new Set(list);
}
