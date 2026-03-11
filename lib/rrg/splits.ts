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
 *   brand_product_70_30 — brand self-listed product (70% brand / 30% platform)
 */

export const RRG_BRAND_ID = '00000000-0000-4000-8000-000000000001';

export type SplitType =
  | 'legacy_70_30'
  | 'rrg_challenge_35_65'
  | 'challenge_35_35_30'
  | 'brand_product_70_30';

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
  ?? '0xe653804032A2d51Cc031795afC601B9b1fd2c375';

/**
 * Round to 2 decimal places using banker's rounding to avoid penny drifts.
 * The platform absorbs any rounding remainder.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

  // ── Brand self-listed product: 70% brand / 30% platform ──
  if (isBrandProduct) {
    const brandUsdc    = round2(totalUsdc * 0.70);
    const platformUsdc = round2(totalUsdc - brandUsdc);
    return {
      splitType:      'brand_product_70_30',
      totalUsdc,
      creatorUsdc:    0,
      brandUsdc,
      platformUsdc,
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
