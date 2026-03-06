import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { db } from '@/lib/rrg/db';
import { sendFileDeliveryEmail } from '@/lib/rrg/email';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

// POST /api/rrg/claim — wallet-to-wallet purchase claim
// Called by agents (e.g. DrHobbs MCP confirm_rrg_purchase tool) after sending
// USDC directly to the platform wallet on Base Sepolia.
//
// Body: { txHash, buyerWallet, tokenId, email? }
// Verifies on-chain, records purchase, returns download URL.

const PLATFORM_WALLET  = (process.env.RRG_PLATFORM_WALLET || '0xe653804032A2d51Cc031795afC601B9b1fd2c375').toLowerCase();
const USDC_CONTRACT    = (process.env.NEXT_PUBLIC_USDC_CONTRACT_TESTNET || '0x036CbD53842c5426634e7929541eC2318f3dCF7e').toLowerCase();
const BASE_SEPOLIA_RPC = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

const TRANSFER_IFACE = new ethers.Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { txHash, buyerWallet, tokenId, email } = body as {
      txHash:      string;
      buyerWallet: string;
      tokenId:     number;
      email?:      string;
    };

    // ── Input validation ──────────────────────────────────────────────────
    if (!txHash || !buyerWallet || !tokenId) {
      return NextResponse.json(
        { error: 'txHash, buyerWallet and tokenId are required' },
        { status: 400 }
      );
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ error: 'Invalid txHash format' }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{40}$/i.test(buyerWallet)) {
      return NextResponse.json({ error: 'Invalid buyerWallet address' }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
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

    // ── Verify on-chain: USDC Transfer to platform wallet ─────────────────
    const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);

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
        { error: 'Transaction not found on Base Sepolia. Ensure it is confirmed before claiming.' },
        { status: 400 }
      );
    }

    if (receipt.status !== 1) {
      return NextResponse.json({ error: 'Transaction failed on-chain' }, { status: 400 });
    }

    // ── Parse Transfer logs from USDC contract ────────────────────────────
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
          error: 'Payment not verified. Ensure you sent the correct USDC amount from your wallet to the platform wallet on Base Sepolia.',
          expected: {
            to:      PLATFORM_WALLET,
            amount:  expectedAmount.toString(),
            network: 'base-sepolia',
            usdc:    USDC_CONTRACT,
          },
        },
        { status: 402 }
      );
    }

    // ── Create purchase record ────────────────────────────────────────────
    const downloadToken  = randomBytes(32).toString('hex');
    const downloadExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const siteUrl        = process.env.NEXT_PUBLIC_SITE_URL!;
    const downloadUrl    = `${siteUrl}/rrg/download?token=${downloadToken}`;

    const { error: insertErr } = await db
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
        ...(email ? { delivery_email: email } : {}),
      });

    if (insertErr) {
      console.error('[/api/rrg/claim] DB insert error:', insertErr);
      return NextResponse.json({ error: 'Database error recording purchase' }, { status: 500 });
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

    console.log(`[/api/rrg/claim] Claim OK — token #${tokenId}, buyer: ${buyerWallet}, tx: ${txHash.slice(0, 10)}…`);

    return NextResponse.json({
      success:       true,
      tokenId,
      txHash,
      downloadUrl,
      downloadToken,
      status:        'pending_mint',
      message:       'Payment verified. Your artwork is ready to download. The ERC-1155 NFT will be minted to your wallet.',
    });

  } catch (err) {
    console.error('[/api/rrg/claim]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
