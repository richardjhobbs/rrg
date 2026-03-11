import { NextRequest, NextResponse } from 'next/server';
import { db, getDropByTokenId, getCurrentNetwork, getBrandById, RRG_BRAND_ID } from '@/lib/rrg/db';
import { getRRGContract } from '@/lib/rrg/contract';
import { splitSignature } from '@/lib/rrg/permit';
import { getSignedUrl } from '@/lib/rrg/storage';
import { uploadToIpfsInBackground } from '@/lib/rrg/ipfs';
import { sendFileDeliveryEmail } from '@/lib/rrg/email';
import { randomBytes } from 'crypto';
import { autopostSale } from '@/lib/rrg/autopost';
import { postReputationSignal } from '@/lib/rrg/erc8004';
import { calculateSplit } from '@/lib/rrg/splits';

export const dynamic = 'force-dynamic';

// POST /api/rrg/confirm — public: mintWithPermit → IPFS → deliver
// Body: { tokenId, buyerWallet, buyerEmail, deadline, signature }
export async function POST(req: NextRequest) {
  try {
    const { tokenId, buyerWallet, buyerEmail, deadline, signature } = await req.json();

    // ── Validate inputs ───────────────────────────────────────────────
    if (!tokenId || !buyerWallet || !deadline || !signature) {
      return NextResponse.json(
        { error: 'tokenId, buyerWallet, deadline, signature required' },
        { status: 400 }
      );
    }

    const drop = await getDropByTokenId(parseInt(tokenId));
    if (!drop) {
      return NextResponse.json({ error: 'Drop not found' }, { status: 404 });
    }

    // ── Split signature ────────────────────────────────────────────────
    const { v, r, s } = splitSignature(signature);

    // ── Submit mintWithPermit ──────────────────────────────────────────
    const contract = getRRGContract();

    let tx: Awaited<ReturnType<typeof contract.mintWithPermit>>;
    try {
      tx = await contract.mintWithPermit(
        tokenId,
        buyerWallet,
        BigInt(deadline),
        v, r, s
      );
    } catch (contractErr: unknown) {
      const msg = String(contractErr);
      if (msg.includes('sold out'))     return NextResponse.json({ error: 'This drop is sold out.' }, { status: 409 });
      if (msg.includes('not active'))   return NextResponse.json({ error: 'This drop is not active.' }, { status: 409 });
      if (msg.includes('permit'))       return NextResponse.json({ error: 'Permit signature invalid or expired.' }, { status: 400 });
      throw contractErr;
    }

    const receipt = await tx.wait(1);
    const txHash  = receipt.hash;

    // ── Generate download token ────────────────────────────────────────
    const downloadToken   = randomBytes(32).toString('hex');
    const downloadExpiry  = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // ── Insert purchase record ─────────────────────────────────────────
    const { data: purchase, error: dbError } = await db
      .from('rrg_purchases')
      .insert({
        submission_id:      drop.id,
        token_id:           parseInt(tokenId),
        buyer_wallet:       buyerWallet.toLowerCase(),
        buyer_email:        buyerEmail || null,
        buyer_type:         'human',
        tx_hash:            txHash,
        amount_usdc:        drop.price_usdc,
        download_token:     downloadToken,
        download_expires_at: downloadExpiry,
        network:             getCurrentNetwork(),
        brand_id:            drop.brand_id ?? RRG_BRAND_ID,
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // ── Record revenue distribution ──────────────────────────────────
    try {
      const brandId = drop.brand_id ?? RRG_BRAND_ID;
      const brand   = brandId !== RRG_BRAND_ID ? await getBrandById(brandId) : null;
      // Legacy = pre-multi-brand RRG drops where on-chain creator != platformWallet
      const isLegacy = brandId === RRG_BRAND_ID && !drop.is_brand_product;

      const split = calculateSplit({
        totalUsdc:      parseFloat(drop.price_usdc ?? '0'),
        brandId,
        creatorWallet:  drop.creator_wallet,
        brandWallet:    brand?.wallet_address ?? null,
        isBrandProduct: drop.is_brand_product ?? false,
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
      console.error('[confirm] Distribution record failed:', distErr);
      // Non-fatal — purchase still succeeded
    }

    // ── Autopost sale (non-blocking) ─────────────────────────────────────
    (async () => {
      try {
        const { count: purchaseCount } = await db
          .from('rrg_purchases')
          .select('id', { count: 'exact', head: true })
          .eq('token_id', parseInt(tokenId));
        const remaining = Math.max(0, (drop.edition_size ?? 10) - (purchaseCount ?? 1));
        const imageUrl = drop.jpeg_storage_path
          ? await getSignedUrl(drop.jpeg_storage_path, 300).catch(() => null)
          : null;
        await autopostSale({
          title:       drop.title,
          tokenId:     parseInt(tokenId),
          buyerWallet: buyerWallet.toLowerCase(),
          remaining,
          creatorBio:  drop.creator_bio ?? null,
          imageUrl,
        });
      } catch (err) {
        console.error('[confirm] autopost failed:', err);
      }
    })();

    // ── ERC-8004 reputation signal (sequential — after mint to avoid nonce collision) ─
    // Both mintWithPermit and giveFeedback use the same deployer wallet signer.
    // Must be sequential to prevent nonce race conditions.
    // Anti-gaming: skip if buyer is the creator (self-purchase inflates score).
    let reputationTxHash: string | null = null;
    const isCreatorPurchase = buyerWallet.toLowerCase() === drop.creator_wallet?.toLowerCase();
    if (isCreatorPurchase) {
      console.log('[erc8004] skipping reputation signal — creator self-purchase detected');
    } else {
      try {
        reputationTxHash = await postReputationSignal({
          buyerWallet: buyerWallet.toLowerCase(),
          priceUsdc:   drop.price_usdc ?? '0',
          tokenId:     parseInt(tokenId),
          txHash,
        });
        console.log(`[confirm] ERC-8004 reputation signal posted: ${reputationTxHash?.slice(0, 10)}…`);
      } catch (repErr) {
        // Non-fatal — purchase + mint still succeeded
        console.error('[confirm] ERC-8004 reputation signal failed:', repErr);
      }
    }

    // ── Post-mint: IPFS upload (synchronous — CID included in response) ───
    let ipfsResult: { imageCid: string; metadataCid: string; metadataUrl: string } | null = null;
    try {
      ipfsResult = await uploadToIpfsInBackground(drop);
    } catch (err) {
      console.error('[confirm] IPFS upload failed:', err);
    }

    // ── Send delivery email ───────────────────────────────────────────
    const siteUrl     = process.env.NEXT_PUBLIC_SITE_URL!;
    const downloadUrl = `${siteUrl}/rrg/download?token=${downloadToken}`;

    if (buyerEmail) {
      try {
        await sendFileDeliveryEmail({
          to:              buyerEmail,
          title:           drop.title,
          tokenId:         parseInt(tokenId),
          txHash,
          downloadUrl,
          ipfsMetadataUrl: ipfsResult?.metadataUrl ?? null,
        });
        await db
          .from('rrg_purchases')
          .update({ files_delivered: true, delivery_email: buyerEmail })
          .eq('id', purchase.id);
      } catch (emailErr) {
        console.error('[confirm] Delivery email failed:', emailErr);
        // Non-fatal — buyer can still use download link
      }
    }

    return NextResponse.json({
      success:          true,
      txHash,
      tokenId:          parseInt(tokenId),
      reputationTxHash,
      downloadUrl,
      downloadToken,
      ipfsImageCid:     ipfsResult?.imageCid    ?? null,
      ipfsImageUrl:     ipfsResult ? `https://gateway.pinata.cloud/ipfs/${ipfsResult.imageCid}` : null,
      ipfsMetadataCid:  ipfsResult?.metadataCid ?? null,
      ipfsMetadataUrl:  ipfsResult?.metadataUrl ?? null,
    });

  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[/api/rrg/confirm]', err);
    return NextResponse.json(
      { error: `Purchase failed: ${detail}` },
      { status: 500 }
    );
  }
}
