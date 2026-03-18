/**
 * Auto-payout: inserts a distribution record and immediately pays out
 * creator/brand shares via on-chain USDC transfer.
 *
 * Called by confirm, claim, and MCP confirm_purchase routes.
 * Non-fatal — if the transfer fails the distribution is marked 'failed'
 * with the error in `notes`, but the purchase still succeeds.
 *
 * Transaction hashes are stored in both rrg_distributions.notes AND
 * rrg_purchases.payout_tx_hashes for dispute resolution.
 */

import { db } from '@/lib/rrg/db';
import { transferUsdc, getPlatformSigner } from '@/lib/rrg/contract';
import { type SplitResult, getBrandPct } from '@/lib/rrg/splits';

export interface AutoPayoutInput {
  purchaseId: string;
  brandId: string;
  split: SplitResult;
}

export interface AutoPayoutResult {
  distributionId: string | null;
  creatorTxHash: string | null;
  brandTxHash: string | null;
}

/**
 * Insert a distribution record, execute USDC payouts, and store tx hashes
 * on both the distribution and purchase records.
 */
export async function insertDistributionAndPay(
  input: AutoPayoutInput,
): Promise<AutoPayoutResult> {
  const { purchaseId, brandId, split } = input;
  const result: AutoPayoutResult = {
    distributionId: null,
    creatorTxHash: null,
    brandTxHash: null,
  };

  // ── 1. Insert distribution record as 'pending' ──────────────────────
  const { data: dist, error: insertErr } = await db
    .from('rrg_distributions')
    .insert({
      purchase_id:    purchaseId,
      brand_id:       brandId,
      total_usdc:     split.totalUsdc,
      creator_usdc:   split.creatorUsdc,
      brand_usdc:     split.brandUsdc,
      platform_usdc:  split.platformUsdc,
      creator_wallet: split.creatorWallet,
      brand_wallet:   split.brandWallet,
      split_type:     split.splitType,
      status:         'pending',
    })
    .select('id')
    .single();

  if (insertErr || !dist) {
    console.error('[auto-payout] Distribution insert failed:', insertErr);
    return result;
  }

  result.distributionId = dist.id;

  // ── 1b. Write audit columns on the purchase record ─────────────────
  const splitModel = split.splitType === 'brand_product_tiered'
    ? 'tiered_brand'
    : split.splitType === 'legacy_70_30'
    ? 'fixed_legacy'
    : 'fixed_co_created';
  const brandPctApplied = split.splitType === 'brand_product_tiered'
    ? getBrandPct(split.totalUsdc)
    : split.splitType === 'challenge_35_35_30'
    ? 35
    : split.splitType === 'legacy_70_30'
    ? 0
    : split.brandUsdc > 0 ? parseFloat((split.brandUsdc / split.totalUsdc * 100).toFixed(2)) : 0;

  await db.from('rrg_purchases')
    .update({
      split_creator_usdc:  split.creatorUsdc,
      split_brand_usdc:    split.brandUsdc,
      split_platform_usdc: split.platformUsdc,
      brand_pct_applied:   parseFloat(brandPctApplied.toFixed(2)),
      split_model:         splitModel,
    })
    .eq('id', purchaseId);

  // ── 2. Legacy splits: on-chain 70/30, no off-chain payout ───────────
  if (split.splitType === 'legacy_70_30') {
    await db.from('rrg_distributions')
      .update({ status: 'completed', notes: 'Legacy on-chain split — no off-chain payout needed' })
      .eq('id', dist.id);
    return result;
  }

  // ── 3. Execute USDC transfers ───────────────────────────────────────
  try {
    const signer = getPlatformSigner();
    let nonce = await signer.getNonce('pending');
    const txHashes: string[] = [];

    // Creator payout
    if (split.creatorUsdc > 0 && split.creatorWallet) {
      const tx = await transferUsdc(split.creatorWallet, split.creatorUsdc, nonce);
      result.creatorTxHash = tx.hash;
      txHashes.push(`creator:${tx.hash}`);
      nonce = tx.nonce + 1;
    }

    // Brand payout
    if (split.brandUsdc > 0 && split.brandWallet) {
      const tx = await transferUsdc(split.brandWallet, split.brandUsdc, nonce);
      result.brandTxHash = tx.hash;
      txHashes.push(`brand:${tx.hash}`);
      nonce = tx.nonce + 1;
    }

    // Mark distribution completed with tx hashes
    const notes = txHashes.join(' | ') || 'No transfers needed (platform-only)';
    await db.from('rrg_distributions')
      .update({ status: 'completed', notes })
      .eq('id', dist.id);

    // Store payout tx hashes on the purchase record for dispute resolution
    await db.from('rrg_purchases')
      .update({ payout_tx_hashes: notes })
      .eq('id', purchaseId);

    console.log(`[auto-payout] ${dist.id} completed:`, txHashes.join(', '));

  } catch (err) {
    const errMsg = String(err);
    console.error(`[auto-payout] ${dist.id} transfer failed:`, errMsg);

    await db.from('rrg_distributions')
      .update({ status: 'failed', notes: `Auto-payout error: ${errMsg.slice(0, 500)}` })
      .eq('id', dist.id);
  }

  return result;
}
