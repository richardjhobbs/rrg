/**
 * Revenue split calculator for multi-brand RRG platform.
 *
 * On-chain contract hardcodes 70% creator / 30% platform.
 * For multi-brand drops, registerDrop sets creator = platformWallet
 * so 100% flows to platform, which distributes off-chain.
 *
 * Split types:
 *   legacy_70_30        — pre-multi-brand RRG drops (on-chain 70/30, no off-chain dist)
 *   rrg_challenge_35_65 — RRG-as-brand challenge (35% creator / 65% RRG)
 *   challenge_35_35_30  — external brand challenge (35% creator / 35% brand / 30% platform)
 *   brand_product_tiered — brand self-listed product (tiered sliding split)
 */

export const RRG_BRAND_ID = '00000000-0000-4000-8000-000000000001';

export type SplitType =
  | 'legacy_70_30'
  | 'rrg_challenge_35_65'
  | 'challenge_35_35_30'
  | 'brand_product_tiered';

export interface SplitInput {
  totalUsdc: number;
  brandId: string | null;
  creatorWallet: string;
  brandWallet: string | null;
  isBrandProduct: boolean;
  /** True for drops that existed before multi-brand migration */
  isLegacy: boolean;
}

export interface SplitResult {
  splitType: SplitType;
  totalUsdc: number;
  creatorUsdc: number;
  brandUsdc: number;
  platformUsdc: number;
  creatorWallet: string;
  brandWallet: string | null;
  /** Address to pass to registerDrop() as the on-chain "creator" */
  onChainCreator: string;
}

const PLATFORM_WALLET = process.env.NEXT_PUBLIC_PLATFORM_WALLET
  ?? '0xbfd71eA27FFc99747dA2873372f84346d9A8b7ed';

/**
 * Round to 6 decimal places (USDC standard precision).
 */
function round6(n: number): number {
  return parseFloat(n.toFixed(6));
}

/**
 * Round to 2 decimal places using banker's rounding to avoid penny drifts.
 * The platform absorbs any rounding remainder.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Tiered brand split (brand-created drops only) ──────────────────────

/**
 * Returns the brand percentage for a brand-created drop based on sale price.
 * Scales continuously across tiers — not step jumps.
 *
 * $0–$9.99:   70%  (fixed)
 * $10–$50:    70% → 85%  (linear)
 * $50–$100:   85% → 95%  (linear)
 * $100–$200:  95% → 97.5% (linear)
 * $200+:      97.5% (fixed cap)
 */
export function getBrandPct(priceUsdc: number): number {
  if (priceUsdc < 10)  return 70;
  if (priceUsdc <= 50)  return 70 + (priceUsdc - 10) / 40 * 15;
  if (priceUsdc <= 100) return 85 + (priceUsdc - 50) / 50 * 10;
  if (priceUsdc <= 200) return 95 + (priceUsdc - 100) / 100 * 2.5;
  return 97.5;
}

/**
 * Compute the revenue split for any drop type.
 * For brand_created drops, uses the tiered sliding scale.
 * For co-created drops, uses the fixed 35/35/30 split.
 */
export function computeSplit(
  priceUsdc: number,
  dropType: 'brand_created' | 'co_created',
): { creator: number; brand: number; platform: number } {
  if (dropType !== 'brand_created') {
    // Co-created drop — fixed split
    return {
      creator:  round6(priceUsdc * 0.35),
      brand:    round6(priceUsdc * 0.35),
      platform: round6(priceUsdc * 0.30),
    };
  }
  // Brand-created drop — tiered split
  const brandPct    = getBrandPct(priceUsdc);
  const platformPct = 100 - brandPct;
  return {
    creator:  0,
    brand:    round6(priceUsdc * brandPct / 100),
    platform: round6(priceUsdc * platformPct / 100),
  };
}

export function calculateSplit(input: SplitInput): SplitResult {
  const { totalUsdc, brandId, creatorWallet, brandWallet, isBrandProduct, isLegacy } = input;

  // ── Legacy drops: on-chain 70/30 stays, no off-chain distribution needed ──
  if (isLegacy) {
    const creatorUsdc  = round2(totalUsdc * 0.70);
    const platformUsdc = round2(totalUsdc - creatorUsdc);
    return {
      splitType:      'legacy_70_30',
      totalUsdc,
      creatorUsdc,
      brandUsdc:      0,
      platformUsdc,
      creatorWallet,
      brandWallet:    null,
      onChainCreator: creatorWallet, // 70% goes to creator on-chain
    };
  }

  // ── Brand self-listed product: tiered sliding split ──
  if (isBrandProduct) {
    const tiered       = computeSplit(totalUsdc, 'brand_created');
    return {
      splitType:      'brand_product_tiered',
      totalUsdc,
      creatorUsdc:    0,
      brandUsdc:      round2(tiered.brand),
      platformUsdc:   round2(tiered.platform),
      creatorWallet,
      brandWallet:    brandWallet ?? creatorWallet,
      onChainCreator: PLATFORM_WALLET, // 100% to platform, distributed off-chain
    };
  }

  // ── RRG-as-brand challenge: 35% creator / 65% RRG ──
  if (brandId === RRG_BRAND_ID || !brandId) {
    const creatorUsdc  = round2(totalUsdc * 0.35);
    const platformUsdc = round2(totalUsdc - creatorUsdc);
    return {
      splitType:      'rrg_challenge_35_65',
      totalUsdc,
      creatorUsdc,
      brandUsdc:      0,
      platformUsdc,
      creatorWallet,
      brandWallet:    null,
      onChainCreator: PLATFORM_WALLET,
    };
  }

  // ── External brand challenge: 35% creator / 35% brand / 30% platform ──
  const creatorUsdc  = round2(totalUsdc * 0.35);
  const brandUsdc    = round2(totalUsdc * 0.35);
  const platformUsdc = round2(totalUsdc - creatorUsdc - brandUsdc);
  return {
    splitType:      'challenge_35_35_30',
    totalUsdc,
    creatorUsdc,
    brandUsdc,
    platformUsdc,
    creatorWallet,
    brandWallet:    brandWallet ?? null,
    onChainCreator: PLATFORM_WALLET,
  };
}
