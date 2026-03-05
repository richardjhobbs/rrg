import { NextRequest, NextResponse } from 'next/server';
import { db, getDropByTokenId } from '@/lib/rrg/db';
import { getRRGContract } from '@/lib/rrg/contract';
import { splitSignature } from '@/lib/rrg/permit';
import { downloadFile } from '@/lib/rrg/storage';
import { resizeAndUpload } from '@/lib/rrg/ipfs';
import { sendFileDeliveryEmail } from '@/lib/rrg/email';
import { randomBytes } from 'crypto';

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
    const isTestnet = process.env.NEXT_PUBLIC_CHAIN_ID === '84532';
    const contract  = getRRGContract(isTestnet);

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
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // ── Post-mint: IPFS upload (non-blocking, fire and forget with logging) ──
    uploadToIpfsInBackground(drop, isTestnet).catch((err) =>
      console.error('[confirm] IPFS upload failed:', err)
    );

    // ── Send delivery email ───────────────────────────────────────────
    const siteUrl     = process.env.NEXT_PUBLIC_SITE_URL!;
    const downloadUrl = `${siteUrl}/api/rrg/download?token=${downloadToken}`;

    if (buyerEmail) {
      try {
        await sendFileDeliveryEmail({
          to:          buyerEmail,
          title:       drop.title,
          tokenId:     parseInt(tokenId),
          txHash,
          downloadUrl,
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
      success:       true,
      txHash,
      tokenId:       parseInt(tokenId),
      downloadUrl,
      downloadToken,
    });

  } catch (err) {
    console.error('[/api/rrg/confirm]', err);
    return NextResponse.json({ error: 'Purchase failed. Please try again.' }, { status: 500 });
  }
}

// ── IPFS upload after mint (runs in background) ────────────────────────
async function uploadToIpfsInBackground(
  drop: Awaited<ReturnType<typeof getDropByTokenId>>,
  isTestnet: boolean
) {
  if (!drop || drop.ipfs_cid) return; // already uploaded

  const jpegBuffer = await downloadFile(drop.jpeg_storage_path);
  const { cid, url } = await resizeAndUpload(jpegBuffer, drop.token_id!, drop.title);

  // Store CID in DB
  await db
    .from('rrg_submissions')
    .update({ ipfs_cid: cid, ipfs_url: url })
    .eq('id', drop.id);

  // Update token URI on-chain (points to IPFS)
  try {
    const contract = getRRGContract(isTestnet);
    const ipfsUri  = `ipfs://${cid}`;
    const tx       = await contract.setTokenURI(drop.token_id!, ipfsUri);
    await tx.wait(1);
    console.log(`[ipfs] Token ${drop.token_id} URI set to ${ipfsUri}`);
  } catch (err) {
    console.error('[ipfs] setTokenURI failed:', err);
  }
}
