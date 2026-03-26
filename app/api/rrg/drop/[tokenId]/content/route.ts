/**
 * GET /api/rrg/drop/[tokenId]/content
 *
 * x402-protected purchase + content delivery.
 *
 * Without payment header → 402 Payment Required (x402 challenge)
 * With valid payment header → 200 + content delivery (mint, IPFS, download)
 *
 * This is the HTTP 402 purchase flow documented in agent-docs under buy_with_x402.
 * Works alongside existing permit (humans) and claim (agents) flows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, getBrandById, RRG_BRAND_ID } from '@/lib/rrg/db';
import { getSignedUrl } from '@/lib/rrg/storage';
import { uploadToIpfsInBackground } from '@/lib/rrg/ipfs';
import { getRRGContract } from '@/lib/rrg/contract';
import { autopostSale } from '@/lib/rrg/autopost';
import { postReputationSignal, postBuyerReputationSignal, fireVoucherSignal, lookupAgentIdByWallet } from '@/lib/rrg/erc8004';
import { randomBytes } from 'crypto';
import { calculateSplit } from '@/lib/rrg/splits';
import { insertDistributionAndPay } from '@/lib/rrg/auto-payout';
import { createVoucher, formatVoucherForDisplay } from '@/lib/rrg/vouchers';
import { incrementTrust } from '@/lib/rrg/agent-trust';
import { firePurchaseAttribution } from '@/lib/rrg/marketing-attribution';
import { extractPaymentProof, build402Challenge, verifyAndExecutePayment } from '@/lib/rrg/x402-server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  try {
    const { tokenId: tokenIdStr } = await params;
    const tokenId = parseInt(tokenIdStr, 10);
    if (isNaN(tokenId)) {
      return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 });
    }

    // ── Look up the drop ──────────────────────────────────────────────────
    const { data: submission, error: subErr } = await db
      .from('rrg_submissions')
      .select('*')
      .eq('token_id', tokenId)
      .eq('status', 'approved')
      .single();

    if (subErr || !submission) {
      return NextResponse.json({ error: 'Drop not found or not approved' }, { status: 404 });
    }

    const priceUsdc = parseFloat(submission.price_usdc ?? '0');
    if (priceUsdc <= 0) {
      return NextResponse.json({ error: 'Drop price not set' }, { status: 400 });
    }

    // ── Check for x402 payment proof ──────────────────────────────────────
    const proof = extractPaymentProof(req.headers);

    if (!proof) {
      // No payment → return 402 challenge
      const challenge = build402Challenge(
        `/api/rrg/drop/${tokenId}/content`,
        priceUsdc,
        `${submission.title} — NFT drop #${tokenId}`,
      );

      const resp = NextResponse.json(challenge.body, { status: 402 });
      resp.headers.set('Payment-Required', challenge.headers['Payment-Required']);
      resp.headers.set('WWW-Authenticate', `Payment realm="RRG" charset="UTF-8"`);
      return resp;
    }

    // ── Verify and execute payment ────────────────────────────────────────
    const paymentResult = await verifyAndExecutePayment(proof, priceUsdc);

    if (!paymentResult.verified) {
      return NextResponse.json(
        { error: `Payment verification failed: ${paymentResult.error}` },
        { status: 402 },
      );
    }

    const buyerWallet = paymentResult.buyerWallet!;
    const paymentTxHash = paymentResult.txHash!;

    // ── Per-wallet purchase limit ─────────────────────────────────────────
    const maxPerWallet: number | null = submission.max_per_wallet ?? null;
    if (maxPerWallet && maxPerWallet > 0) {
      const { count } = await db
        .from('rrg_purchases')
        .select('id', { count: 'exact', head: true })
        .eq('token_id', tokenId)
        .eq('buyer_wallet', buyerWallet);

      if ((count ?? 0) >= maxPerWallet) {
        return NextResponse.json(
          { error: `Purchase limit reached: max ${maxPerWallet} per wallet` },
          { status: 409 },
        );
      }
    }

    // ── Check txHash not already used ─────────────────────────────────────
    const { data: existing } = await db
      .from('rrg_purchases')
      .select('id')
      .eq('tx_hash', paymentTxHash)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'This payment has already been processed' },
        { status: 409 },
      );
    }

    // ── Create purchase record ────────────────────────────────────────────
    const downloadToken  = randomBytes(32).toString('hex');
    const downloadExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const siteUrl        = process.env.NEXT_PUBLIC_SITE_URL!;
    const downloadUrl    = `${siteUrl}/rrg/download?token=${downloadToken}`;

    const { data: purchase, error: insertErr } = await db
      .from('rrg_purchases')
      .insert({
        submission_id:       submission.id,
        token_id:            tokenId,
        buyer_wallet:        buyerWallet,
        buyer_type:          'agent',
        tx_hash:             paymentTxHash,
        amount_usdc:         priceUsdc.toString(),
        download_token:      downloadToken,
        download_expires_at: downloadExpiry,
        files_delivered:     false,
        mint_status:         'pending',
        brand_id:            submission.brand_id ?? RRG_BRAND_ID,
        payment_method:      'x402',
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[x402/content] DB insert error:', insertErr);
      return NextResponse.json({ error: 'Database error recording purchase' }, { status: 500 });
    }

    // ── Mint NFT on-chain ─────────────────────────────────────────────────
    let mintTxHash: string | null = null;
    try {
      const contract    = getRRGContract();
      const mintTx      = await contract.operatorMint(tokenId, buyerWallet);
      const mintReceipt = await mintTx.wait(1);
      mintTxHash = mintReceipt.hash;

      await db
        .from('rrg_purchases')
        .update({ mint_status: 'minted' })
        .eq('tx_hash', paymentTxHash);

      console.log(`[x402/content] operatorMint OK — token #${tokenId} → ${buyerWallet}`);
    } catch (mintErr) {
      console.error('[x402/content] operatorMint failed:', mintErr);
      // Non-fatal — payment verified, download works, mint can be retried
    }

    // ── ERC-8004 reputation signals (sequential for nonce safety) ─────────
    let reputationTxHash: string | null = null;
    try {
      const resolvedBuyerAgentId = await lookupAgentIdByWallet(buyerWallet);
      if (resolvedBuyerAgentId) {
        reputationTxHash = await postReputationSignal({
          buyerAgentId: resolvedBuyerAgentId,
          buyerWallet,
          priceUsdc: submission.price_usdc ?? '0',
          tokenId,
          txHash: paymentTxHash,
        });

        await postBuyerReputationSignal({
          buyerAgentId: resolvedBuyerAgentId,
          buyerWallet,
          priceUsdc: submission.price_usdc ?? '0',
          tokenId,
          txHash: paymentTxHash,
        });
      }
    } catch (repErr) {
      console.error('[x402/content] ERC-8004 signals failed:', repErr);
    }

    // ── IPFS upload (synchronous) ─────────────────────────────────────────
    let ipfsResult: { imageCid: string; metadataCid: string; metadataUrl: string } | null = null;
    try {
      ipfsResult = await uploadToIpfsInBackground(submission);
    } catch {
      console.error('[x402/content] IPFS upload failed');
    }

    // ── Autopost (non-blocking) ───────────────────────────────────────────
    (async () => {
      try {
        const { count: totalPurchases } = await db
          .from('rrg_purchases')
          .select('id', { count: 'exact', head: true })
          .eq('token_id', tokenId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub         = submission as any;
        const editionSize = (sub.edition_size as number) ?? 10;
        const remaining   = Math.max(0, editionSize - (totalPurchases ?? 1));
        const imageUrl    = sub.jpeg_storage_path
          ? await getSignedUrl(sub.jpeg_storage_path as string, 300).catch(() => null)
          : null;
        await autopostSale({
          title:       sub.title,
          tokenId,
          buyerWallet,
          remaining,
          creatorBio:  (sub.creator_bio as string) ?? null,
          imageUrl,
        });
      } catch (err) {
        console.error('[x402/content] autopost failed:', err);
      }
    })();

    // ── Voucher generation ────────────────────────────────────────────────
    let voucherData: Awaited<ReturnType<typeof formatVoucherForDisplay>> = null;
    if (submission.has_voucher && submission.voucher_template_id) {
      try {
        const voucher = await createVoucher({
          templateId:   submission.voucher_template_id,
          purchaseId:   purchase.id,
          submissionId: submission.id,
          brandId:      submission.brand_id ?? RRG_BRAND_ID,
          buyerWallet,
        });
        voucherData = await formatVoucherForDisplay(voucher);
        try {
          await fireVoucherSignal({
            buyerWallet,
            voucherCode: voucher.code,
            brandId:     submission.brand_id ?? RRG_BRAND_ID,
            tokenId,
            signalType:  'voucher_issued',
          });
        } catch { /* non-fatal */ }
      } catch { /* non-fatal */ }
    }

    // ── Revenue distribution + auto-payout ────────────────────────────────
    try {
      const brandId = submission.brand_id ?? RRG_BRAND_ID;
      const brand   = brandId !== RRG_BRAND_ID ? await getBrandById(brandId) : null;
      const isLegacy = brandId === RRG_BRAND_ID && !submission.is_brand_product;

      const split = calculateSplit({
        totalUsdc:      priceUsdc,
        brandId,
        creatorWallet:  submission.creator_wallet,
        brandWallet:    brand?.wallet_address ?? null,
        isBrandProduct: submission.is_brand_product ?? false,
        isLegacy,
      });

      await insertDistributionAndPay({
        purchaseId: purchase.id,
        brandId,
        split,
      });

      firePurchaseAttribution(buyerWallet, paymentTxHash, split.platformUsdc);
    } catch (distErr) {
      console.error('[x402/content] Distribution failed:', distErr);
    }

    // ── Agent trust ───────────────────────────────────────────────────────
    if (submission.brand_id && submission.brand_id !== RRG_BRAND_ID) {
      try {
        await incrementTrust(submission.brand_id, buyerWallet, priceUsdc);
      } catch { /* non-fatal */ }
    }

    // ── Mem0 memory write (fire-and-forget) ───────────────────────────────
    try {
      const { fireMemoryAdd } = await import('@/lib/rrg/mem0');
      fireMemoryAdd(buyerWallet, [
        {
          role: 'assistant' as const,
          content: `Agent purchased "${submission.title}" (tokenId ${tokenId}) for ${priceUsdc} USDC via x402 HTTP 402 flow`,
        },
      ], { action: 'purchase', tokenId: String(tokenId), paymentMethod: 'x402' });
    } catch { /* non-fatal */ }

    // ── Response ──────────────────────────────────────────────────────────
    console.log(`[x402/content] Purchase complete — token #${tokenId}, buyer: ${buyerWallet}, tx: ${paymentTxHash.slice(0, 10)}…`);

    return NextResponse.json({
      success:          true,
      tokenId,
      paymentTxHash,
      mintTxHash,
      reputationTxHash,
      downloadUrl,
      downloadToken,
      status:           mintTxHash ? 'minted' : 'pending_mint',
      paymentMethod:    'x402',
      ipfsImageCid:     ipfsResult?.imageCid ?? null,
      ipfsImageUrl:     ipfsResult ? `https://gateway.pinata.cloud/ipfs/${ipfsResult.imageCid}` : null,
      ipfsMetadataCid:  ipfsResult?.metadataCid ?? null,
      ipfsMetadataUrl:  ipfsResult?.metadataUrl ?? null,
      voucher:          voucherData,
      message:          mintTxHash
        ? 'Payment verified via x402 and ERC-1155 NFT minted to your wallet.'
        : 'Payment verified via x402. NFT will be minted shortly.',
    });

  } catch (err) {
    console.error('[x402/content]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
