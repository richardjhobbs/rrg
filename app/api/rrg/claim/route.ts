import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { db, getBrandById, RRG_BRAND_ID } from '@/lib/rrg/db';
import { sendFileDeliveryEmail } from '@/lib/rrg/email';
import { getSignedUrl } from '@/lib/rrg/storage';
import { uploadToIpfsInBackground } from '@/lib/rrg/ipfs';
import { getRRGContract } from '@/lib/rrg/contract';
import { autopostSale } from '@/lib/rrg/autopost';
import { postReputationSignal } from '@/lib/rrg/erc8004';
import { randomBytes } from 'crypto';
import { calculateSplit } from '@/lib/rrg/splits';

export const dynamic = 'force-dynamic';

// POST /api/rrg/claim — wallet-to-wallet purchase claim (agent-to-agent)
// Called by agents (e.g. DrHobbs MCP confirm_rrg_purchase tool) after sending
// USDC directly to the platform wallet on Base mainnet.
//
// Body: { txHash, buyerWallet, tokenId, email? }
// Verifies on-chain, mints NFT via operatorMint, records purchase, returns download URL + IPFS details.

const PLATFORM_WALLET = (process.env.RRG_PLATFORM_WALLET || '0xe653804032A2d51Cc031795afC601B9b1fd2c375').toLowerCase();
const USDC_CONTRACT   = (process.env.NEXT_PUBLIC_USDC_CONTRACT_MAINNET || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913').toLowerCase();
const BASE_RPC        = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';

const TRANSFER_IFACE = new ethers.Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { txHash: rawTxHash, buyerWallet, tokenId, email } = body as {
      txHash?:     string;
      buyerWallet: string;
      tokenId:     number;
      email?:      string;
    };

    // ── Input validation ──────────────────────────────────────────────────
    if (!buyerWallet || !tokenId) {
      return NextResponse.json(
        { error: 'buyerWallet and tokenId are required' },
        { status: 400 }
      );
    }
    if (!/^0x[0-9a-fA-F]{40}$/i.test(buyerWallet)) {
      return NextResponse.json({ error: 'Invalid buyerWallet address' }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // ── Operator self-purchase detection ─────────────────────────────────
    // When buyer IS the platform wallet (e.g. DrHobbs buying its own drops),
    // USDC payment verification is skipped — requires admin auth instead.
    const isSelfPurchase = buyerWallet.toLowerCase() === PLATFORM_WALLET;

    if (isSelfPurchase) {
      const adminSecret = req.headers.get('x-admin-secret');
      if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        return NextResponse.json(
          { error: 'Admin auth required for operator self-purchases' },
          { status: 401 }
        );
      }
    }

    // txHash required for normal purchases, optional for self-purchases
    const txHash = isSelfPurchase && !rawTxHash
      ? `0x${randomBytes(32).toString('hex')}`   // synthetic unique hash
      : rawTxHash;

    if (!txHash) {
      return NextResponse.json({ error: 'txHash is required' }, { status: 400 });
    }
    if (!isSelfPurchase && !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ error: 'Invalid txHash format' }, { status: 400 });
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

    // ── Check txHash not already used ─────────────────────────────────────
    const { data: existing } = await db
      .from('rrg_purchases')
      .select('id')
      .eq('tx_hash', txHash)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'This transaction hash has already been used for a purchase' },
        { status: 409 }
      );
    }

    // ── Verify on-chain (skipped for self-purchases) ─────────────────────
    if (!isSelfPurchase) {
      const provider = new ethers.JsonRpcProvider(BASE_RPC);

      let receipt: ethers.TransactionReceipt | null;
      try {
        receipt = await provider.getTransactionReceipt(txHash);
      } catch {
        return NextResponse.json(
          { error: 'Could not fetch transaction. It may still be pending — wait for confirmation and try again.' },
          { status: 400 }
        );
      }

      if (!receipt) {
        return NextResponse.json(
          { error: 'Transaction not found on Base. Ensure it is confirmed before claiming.' },
          { status: 400 }
        );
      }

      if (receipt.status !== 1) {
        return NextResponse.json({ error: 'Transaction failed on-chain' }, { status: 400 });
      }

      // ── Parse Transfer logs from USDC contract ──────────────────────────
      const expectedAmount = BigInt(Math.round(Number(submission.price_usdc) * 1_000_000));

      let paymentVerified = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== USDC_CONTRACT) continue;
        try {
          const parsed = TRANSFER_IFACE.parseLog({ topics: log.topics as string[], data: log.data });
          if (!parsed) continue;
          const from:  string = parsed.args[0];
          const to:    string = parsed.args[1];
          const value: bigint = parsed.args[2];

          if (
            from.toLowerCase()  === buyerWallet.toLowerCase() &&
            to.toLowerCase()    === PLATFORM_WALLET &&
            value               >= expectedAmount
          ) {
            paymentVerified = true;
            break;
          }
        } catch {
          // Not a Transfer event from this log — skip
        }
      }

      if (!paymentVerified) {
        return NextResponse.json(
          {
            error: 'Payment not verified. Ensure you sent the correct USDC amount from your wallet to the platform wallet on Base.',
            expected: {
              to:      PLATFORM_WALLET,
              amount:  expectedAmount.toString(),
              network: 'base',
              usdc:    USDC_CONTRACT,
            },
          },
          { status: 402 }
        );
      }
    } else {
      console.log(`[/api/rrg/claim] Operator self-purchase — skipping USDC verification for token #${tokenId}`);
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
        buyer_wallet:        buyerWallet.toLowerCase(),
        buyer_type:          'agent',
        tx_hash:             txHash,
        amount_usdc:         submission.price_usdc.toString(),
        download_token:      downloadToken,
        download_expires_at: downloadExpiry,
        files_delivered:     false,
        mint_status:         'pending',
        brand_id:            submission.brand_id ?? RRG_BRAND_ID,
        ...(email ? { delivery_email: email } : {}),
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[/api/rrg/claim] DB insert error:', insertErr);
      return NextResponse.json({ error: 'Database error recording purchase' }, { status: 500 });
    }

    // ── Record revenue distribution ──────────────────────────────────
    try {
      const brandId = submission.brand_id ?? RRG_BRAND_ID;
      const brand   = brandId !== RRG_BRAND_ID ? await getBrandById(brandId) : null;
      const isLegacy = brandId === RRG_BRAND_ID && !submission.is_brand_product;

      const split = calculateSplit({
        totalUsdc:      parseFloat(submission.price_usdc ?? '0'),
        brandId,
        creatorWallet:  submission.creator_wallet,
        brandWallet:    brand?.wallet_address ?? null,
        isBrandProduct: submission.is_brand_product ?? false,
        isLegacy,
      });

      await db.from('rrg_distributions').insert({
        purchase_id:    purchase.id,
        brand_id:       brandId,
        total_usdc:     split.totalUsdc,
        creator_usdc:   split.creatorUsdc,
        brand_usdc:     split.brandUsdc,
        platform_usdc:  split.platformUsdc,
        creator_wallet: split.creatorWallet,
        brand_wallet:   split.brandWallet,
        split_type:     split.splitType,
        status:         'pending',
      });
    } catch (distErr) {
      console.error('[claim] Distribution record failed:', distErr);
    }

    // ── Send delivery email if provided ───────────────────────────────────
    if (email) {
      try {
        await sendFileDeliveryEmail({
          to:          email,
          title:       submission.title,
          tokenId,
          txHash,
          downloadUrl,
        });
        await db
          .from('rrg_purchases')
          .update({ files_delivered: true })
          .eq('tx_hash', txHash);
      } catch (emailErr) {
        console.error('[/api/rrg/claim] Email delivery error:', emailErr);
        // Non-fatal — download URL still returned in response
      }
    }

    // ── Mint NFT on-chain via operatorMint ────────────────────────────────
    let mintTxHash: string | null = null;
    try {
      const contract    = getRRGContract();
      const mintTx      = await contract.operatorMint(tokenId, buyerWallet);
      const mintReceipt = await mintTx.wait(1);
      mintTxHash = mintReceipt.hash;

      // Update mint_status to 'minted' in DB
      await db
        .from('rrg_purchases')
        .update({ mint_status: 'minted' })
        .eq('tx_hash', txHash);

      console.log(`[/api/rrg/claim] operatorMint OK — token #${tokenId} → ${buyerWallet}, mintTx: ${mintTxHash?.slice(0, 10)}…`);
    } catch (mintErr) {
      // Non-fatal — payment verified, download still works; mint can be retried via admin
      console.error('[/api/rrg/claim] operatorMint failed:', mintErr);
    }

    console.log(`[/api/rrg/claim] Claim OK — token #${tokenId}, buyer: ${buyerWallet}, tx: ${txHash.slice(0, 10)}…`);

    // ── ERC-8004 reputation signal (sequential — after mint to avoid nonce collision) ─
    // Both operatorMint and giveFeedback use the same deployer wallet signer.
    // Must be sequential to prevent nonce race conditions.
    let reputationTxHash: string | null = null;
    try {
      reputationTxHash = await postReputationSignal({
        buyerWallet: buyerWallet.toLowerCase(),
        priceUsdc:   submission.price_usdc ?? '0',
        tokenId,
        txHash,
      });
      console.log(`[/api/rrg/claim] ERC-8004 reputation signal posted: ${reputationTxHash?.slice(0, 10)}…`);
    } catch (repErr) {
      // Non-fatal — purchase + mint still succeeded
      console.error('[/api/rrg/claim] ERC-8004 reputation signal failed:', repErr);
    }

    // ── IPFS upload (synchronous — CID included in response) ─────────────
    let ipfsResult: { imageCid: string; metadataCid: string; metadataUrl: string } | null = null;
    try {
      ipfsResult = await uploadToIpfsInBackground(submission);
    } catch (err) {
      console.error('[/api/rrg/claim] IPFS upload failed:', err);
    }

    // ── Autopost sale (non-blocking) ──────────────────────────────────────
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
          buyerWallet: buyerWallet.toLowerCase(),
          remaining,
          creatorBio:  (sub.creator_bio as string) ?? null,
          imageUrl,
        });
      } catch (err) {
        console.error('[/api/rrg/claim] autopost failed:', err);
      }
    })();

    return NextResponse.json({
      success:          true,
      tokenId,
      txHash,
      mintTxHash,
      reputationTxHash,
      downloadUrl,
      downloadToken,
      status:           mintTxHash ? 'minted' : 'pending_mint',
      ipfsImageCid:     ipfsResult?.imageCid    ?? null,
      ipfsImageUrl:     ipfsResult ? `https://gateway.pinata.cloud/ipfs/${ipfsResult.imageCid}` : null,
      ipfsMetadataCid:  ipfsResult?.metadataCid ?? null,
      ipfsMetadataUrl:  ipfsResult?.metadataUrl ?? null,
      message:          mintTxHash
        ? 'Payment verified and ERC-1155 NFT minted to your wallet. Your artwork is ready to download.'
        : 'Payment verified. Your artwork is ready to download. The ERC-1155 NFT will be minted to your wallet shortly.',
    });

  } catch (err) {
    console.error('[/api/rrg/claim]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
