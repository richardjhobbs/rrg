/**
 * POST /api/rrg/admin/contract-migrate
 *
 * Admin-only. Migrates all approved drops and existing purchases to the new
 * RRG contract address (NEXT_PUBLIC_RRG_CONTRACT_ADDRESS).
 *
 * Step 1 — Re-register drops:
 *   For each approved submission, calls registerDrop() on the new contract.
 *   Skips if tokenId is already registered (getDrop.creator != address(0)).
 *
 * Step 2 — Re-mint purchases:
 *   For each purchase, calls operatorMint() on the new contract.
 *   Skips if buyer already holds ≥1 of that tokenId (balanceOf check).
 *
 * Processes sequentially to avoid RPC rate limits.
 * Safe to re-run — all steps are idempotent.
 */

import { NextResponse } from 'next/server';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';
import { db, getCurrentNetwork } from '@/lib/rrg/db';
import { getRRGContract, getRRGReadOnly, toUsdc6dp, verifyOwnership } from '@/lib/rrg/contract';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  const contract  = getRRGContract();
  const readOnly  = getRRGReadOnly();
  const network   = getCurrentNetwork();

  const dropResults: {
    tokenId:  number;
    title:    string;
    status:   'registered' | 'already_registered' | 'failed';
    txHash?:  string;
    error?:   string;
  }[] = [];

  const mintResults: {
    tokenId:     number;
    buyerWallet: string;
    status:      'minted' | 'already_owns' | 'failed';
    txHash?:     string;
    error?:      string;
  }[] = [];

  // ── Step 1: Re-register drops ──────────────────────────────────────────
  const { data: submissions, error: subErr } = await db
    .from('rrg_submissions')
    .select('token_id, title, creator_wallet, price_usdc, edition_size')
    .eq('status', 'approved')
    .eq('network', network)
    .order('token_id', { ascending: true });

  if (subErr) {
    return NextResponse.json({ error: `DB query failed: ${subErr.message}` }, { status: 500 });
  }

  for (const sub of submissions ?? []) {
    const tokenId = sub.token_id as number;
    try {
      // Check if already registered on new contract
      const onChain = await readOnly.getDrop(tokenId);
      if (onChain.creator !== '0x0000000000000000000000000000000000000000') {
        dropResults.push({ tokenId, title: sub.title, status: 'already_registered' });
        console.log(`[contract-migrate] Drop #${tokenId} already registered — skip`);
        continue;
      }

      const price6dp = toUsdc6dp(parseFloat(sub.price_usdc));
      const tx       = await contract.registerDrop(
        tokenId,
        sub.creator_wallet,
        price6dp,
        sub.edition_size
      );
      const receipt  = await tx.wait(1);

      dropResults.push({ tokenId, title: sub.title, status: 'registered', txHash: receipt.hash });
      console.log(`[contract-migrate] Drop #${tokenId} registered — tx: ${receipt.hash.slice(0, 10)}…`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dropResults.push({ tokenId, title: sub.title, status: 'failed', error: msg });
      console.error(`[contract-migrate] Drop #${tokenId} registerDrop failed:`, err);
    }
  }

  // ── Step 2: Re-mint all purchases ─────────────────────────────────────
  const { data: purchases, error: purchaseErr } = await db
    .from('rrg_purchases')
    .select('token_id, buyer_wallet')
    .eq('network', network)
    .order('token_id', { ascending: true });

  if (purchaseErr) {
    return NextResponse.json({
      error:       `DB query failed (purchases): ${purchaseErr.message}`,
      dropResults,
    }, { status: 500 });
  }

  for (const purchase of purchases ?? []) {
    const tokenId    = purchase.token_id    as number;
    const buyerWallet = purchase.buyer_wallet as string;
    try {
      // Check if buyer already owns this token on new contract
      const alreadyOwns = await verifyOwnership(buyerWallet, tokenId).catch(() => false);
      if (alreadyOwns) {
        mintResults.push({ tokenId, buyerWallet, status: 'already_owns' });
        console.log(`[contract-migrate] Token #${tokenId} already owned by ${buyerWallet} — skip`);
        continue;
      }

      const mintTx     = await contract.operatorMint(tokenId, buyerWallet);
      const mintReceipt = await mintTx.wait(1);

      mintResults.push({ tokenId, buyerWallet, status: 'minted', txHash: mintReceipt.hash });
      console.log(`[contract-migrate] Minted #${tokenId} → ${buyerWallet}, tx: ${mintReceipt.hash.slice(0, 10)}…`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      mintResults.push({ tokenId, buyerWallet, status: 'failed', error: msg });
      console.error(`[contract-migrate] operatorMint #${tokenId} → ${buyerWallet} failed:`, err);
    }
  }

  const dropsOk     = dropResults.filter((r) => r.status === 'registered').length;
  const dropsFailed = dropResults.filter((r) => r.status === 'failed').length;
  const mintsOk     = mintResults.filter((r) => r.status === 'minted').length;
  const mintsFailed = mintResults.filter((r) => r.status === 'failed').length;

  return NextResponse.json({
    contractAddress: process.env.NEXT_PUBLIC_RRG_CONTRACT_ADDRESS,
    drops: {
      processed:        dropResults.length,
      registered:       dropsOk,
      already_registered: dropResults.filter((r) => r.status === 'already_registered').length,
      failed:           dropsFailed,
      results:          dropResults,
    },
    mints: {
      processed:    mintResults.length,
      minted:       mintsOk,
      already_owns: mintResults.filter((r) => r.status === 'already_owns').length,
      failed:       mintsFailed,
      results:      mintResults,
    },
  });
}
