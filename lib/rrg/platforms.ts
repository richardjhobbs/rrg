/**
 * Platform badge system — partner attestations for RRG
 *
 * External platforms (MrChief, OpenClaw-based, etc.) register as partners,
 * get an API key, and can attest that a wallet or submission was created
 * on their platform. Badges appear on RRG drops.
 */

import { createHash } from 'crypto';
import { unstable_cache } from 'next/cache';
import { db } from './db';

// ── Types ──────────────────────────────────────────────────────────────

export interface PartnerPlatform {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  accent_color: string;
  website_url: string | null;
  active: boolean;
}

export interface PlatformBadgeInfo {
  platformSlug: string;
  platformName: string;
  logoUrl: string | null;
  accentColor: string;
  websiteUrl: string | null;
  attestationType: 'wallet' | 'submission';
  createdAt: string;
}

// ── API key helpers ────────────────────────────────────────────────────

/** Hash an API key with SHA-256 */
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Extract the prefix (first 12 chars including rrg_pk_ prefix) */
function keyPrefix(key: string): string {
  return key.slice(0, 12);
}

/**
 * Verify an API key against the database.
 * Returns the platform record if valid, null otherwise.
 */
export async function verifyApiKey(
  apiKey: string
): Promise<PartnerPlatform | null> {
  if (!apiKey || !apiKey.startsWith('rrg_pk_')) return null;

  const prefix = keyPrefix(apiKey);
  const hash = hashKey(apiKey);

  const { data } = await db
    .from('rrg_partner_platforms')
    .select('id, name, slug, logo_url, accent_color, website_url, active')
    .eq('api_key_prefix', prefix)
    .eq('api_key_hash', hash)
    .eq('active', true)
    .single();

  return (data as PartnerPlatform) ?? null;
}

// ── Attestation queries ────────────────────────────────────────────────

/**
 * Get all platform attestations for a wallet address.
 * Joins with platforms table to include display info.
 */
export async function getAttestationsForWallet(
  wallet: string
): Promise<PlatformBadgeInfo[]> {
  const { data } = await db
    .from('rrg_platform_attestations')
    .select(
      `
      attestation_type,
      created_at,
      rrg_partner_platforms!inner (
        slug,
        name,
        logo_url,
        accent_color,
        website_url
      )
    `
    )
    .eq('wallet_address', wallet.toLowerCase())
    .eq('rrg_partner_platforms.active', true);

  if (!data) return [];

  return data.map((row: any) => {
    const p = row.rrg_partner_platforms;
    return {
      platformSlug: p.slug,
      platformName: p.name,
      logoUrl: p.logo_url,
      accentColor: p.accent_color,
      websiteUrl: p.website_url,
      attestationType: row.attestation_type,
      createdAt: row.created_at,
    };
  });
}

/**
 * Batch lookup: given arrays of wallets and submission IDs,
 * return a map of wallet → PlatformBadgeInfo[].
 * At most 2 queries (wallet-level + submission-level). No N+1.
 */
export async function getBadgesForDrops(
  wallets: string[],
  submissionIds: string[]
): Promise<Map<string, PlatformBadgeInfo[]>> {
  if (wallets.length === 0) return new Map();
  const cacheKey = [...wallets].sort().join('|') + '::' + [...submissionIds].sort().join('|');
  const fetch = unstable_cache(
    async () => {
      const lowerWallets = wallets.map((w) => w.toLowerCase());

      // Query wallet-level attestations
      const { data: walletRows } = await db
        .from('rrg_platform_attestations')
        .select(`wallet_address, attestation_type, created_at, rrg_partner_platforms!inner (slug, name, logo_url, accent_color, website_url, active)`)
        .in('wallet_address', lowerWallets)
        .eq('attestation_type', 'wallet');

      // Query submission-level attestations
      const { data: submissionRows } = submissionIds.length > 0
        ? await db
            .from('rrg_platform_attestations')
            .select(`wallet_address, attestation_type, created_at, rrg_partner_platforms!inner (slug, name, logo_url, accent_color, website_url, active)`)
            .in('submission_id', submissionIds)
            .eq('attestation_type', 'submission')
        : { data: [] };

      const allRows = [...(walletRows ?? []), ...(submissionRows ?? [])];
      const entries: [string, PlatformBadgeInfo][] = [];

      for (const row of allRows) {
        const p = (row as any).rrg_partner_platforms;
        if (!p?.active) continue;
        const wallet = (row as any).wallet_address?.toLowerCase();
        if (!wallet) continue;
        entries.push([wallet, {
          platformSlug: p.slug,
          platformName: p.name,
          logoUrl: p.logo_url,
          accentColor: p.accent_color,
          websiteUrl: p.website_url,
          attestationType: (row as any).attestation_type,
          createdAt: (row as any).created_at,
        }]);
      }
      return entries;
    },
    [`platform-badges-${cacheKey}`],
    { revalidate: 300 }, // 5-min cache
  );

  const entries = await fetch();
  const result = new Map<string, PlatformBadgeInfo[]>();
  for (const [wallet, badge] of entries) {
    const existing = result.get(wallet) ?? [];
    if (!existing.some((b) => b.platformSlug === badge.platformSlug)) {
      existing.push(badge);
      result.set(wallet, existing);
    }
  }
  return result;
}
