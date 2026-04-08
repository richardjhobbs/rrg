import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { topUpCredits } from '@/lib/agent/credits';
import { ethers } from 'ethers';

export const dynamic = 'force-dynamic';

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base mainnet USDC
const PLATFORM_WALLET = process.env.NEXT_PUBLIC_PLATFORM_WALLET!;
const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';

const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

/**
 * POST /api/agent/[agentId]/credits/topup
 *
 * Verify a USDC transfer tx from the agent's wallet to the platform wallet,
 * then credit the equivalent USD amount to Concierge Credits.
 *
 * Body: { tx_hash: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const { tx_hash } = await req.json();

  if (!tx_hash) {
    return NextResponse.json({ error: 'tx_hash is required' }, { status: 400 });
  }

  // Load agent
  const { data: agent } = await db
    .from('agent_agents')
    .select('id, wallet_address')
    .eq('id', agentId)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Check this tx hasn't already been used for a top-up
  const { data: existing } = await db
    .from('agent_credit_transactions')
    .select('id')
    .eq('tx_hash', tx_hash)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'This transaction has already been credited' }, { status: 409 });
  }

  try {
    // Verify the transaction on-chain
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const receipt = await provider.getTransactionReceipt(tx_hash);

    if (!receipt || receipt.status !== 1) {
      return NextResponse.json({ error: 'Transaction not confirmed or failed' }, { status: 400 });
    }

    // Parse USDC Transfer event from the receipt
    const usdcInterface = new ethers.Interface(USDC_ABI);
    const transferTopic = ethers.id('Transfer(address,address,uint256)');

    let amountRaw: bigint | null = null;

    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
        log.topics[0] === transferTopic
      ) {
        const from = '0x' + log.topics[1].slice(26);
        const to = '0x' + log.topics[2].slice(26);

        // Verify: from agent wallet, to platform wallet
        if (
          from.toLowerCase() === agent.wallet_address.toLowerCase() &&
          to.toLowerCase() === PLATFORM_WALLET.toLowerCase()
        ) {
          amountRaw = BigInt(log.data);
          break;
        }
      }
    }

    if (amountRaw === null) {
      return NextResponse.json(
        { error: 'No USDC transfer found from your wallet to the platform wallet in this transaction' },
        { status: 400 }
      );
    }

    // Convert from 6 decimals to USD (1:1 USDC to USD)
    const amountUsd = Number(amountRaw) / 1_000_000;

    if (amountUsd < 0.01) {
      return NextResponse.json({ error: 'Amount too small (minimum $0.01)' }, { status: 400 });
    }

    // Credit the account
    const newBalance = await topUpCredits(agentId, amountUsd, tx_hash);

    return NextResponse.json({
      credited: amountUsd,
      new_balance: newBalance,
      tx_hash,
    });
  } catch (err) {
    console.error('[credits topup]', err);
    return NextResponse.json({ error: 'Failed to verify transaction' }, { status: 500 });
  }
}
