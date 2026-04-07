import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { db } from '@/lib/rrg/db';
import { parseInstructions } from '@/lib/agent/rules';
import { setAgentSession } from '@/lib/agent/auth';
import type { AgentTier, BidAggression, LlmProvider } from '@/lib/agent/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agent/import
 *
 * Import an existing wallet via signature challenge.
 * Owner proves wallet ownership by signing a message.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      email,
      name,
      tier = 'basic',
      wallet_address,
      signature,
      nonce,
      style_tags = [],
      free_instructions = null,
      budget_ceiling_usdc = null,
      bid_aggression = 'balanced',
      llm_provider = 'claude',
    } = body as {
      email: string;
      name: string;
      tier?: AgentTier;
      wallet_address: string;
      signature: string;
      nonce: string;
      style_tags?: string[];
      free_instructions?: string | null;
      budget_ceiling_usdc?: number | null;
      bid_aggression?: BidAggression;
      llm_provider?: LlmProvider;
    };

    if (!email || !name || !wallet_address || !signature || !nonce) {
      return NextResponse.json(
        { error: 'email, name, wallet_address, signature, and nonce are required' },
        { status: 400 }
      );
    }

    // Verify signature
    const message = `Verify wallet ownership for VIA Agent Drop System\nNonce: ${nonce}`;
    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature);
    } catch {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    if (recoveredAddress.toLowerCase() !== wallet_address.toLowerCase()) {
      return NextResponse.json(
        { error: 'Signature does not match wallet address' },
        { status: 403 }
      );
    }

    // Check wallet not already registered
    const { data: existing } = await db
      .from('agent_agents')
      .select('id')
      .eq('wallet_address', wallet_address.toLowerCase())
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'This wallet is already registered to an agent' },
        { status: 409 }
      );
    }

    const parsed_rules = parseInstructions(free_instructions);

    const { data: agent, error } = await db
      .from('agent_agents')
      .insert({
        email: email.toLowerCase().trim(),
        name: name.trim(),
        tier,
        style_tags,
        free_instructions,
        parsed_rules,
        budget_ceiling_usdc,
        bid_aggression,
        wallet_address: wallet_address.toLowerCase(),
        wallet_type: 'imported',
        llm_provider,
        credit_balance_usdc: 0,
        status: 'active',
      })
      .select('*')
      .single();

    if (error) {
      console.error('Agent import error:', error);
      return NextResponse.json(
        { error: 'Failed to import agent' },
        { status: 500 }
      );
    }

    await db.from('agent_activity_log').insert({
      agent_id: agent.id,
      action: 'agent_imported',
      details: { tier, wallet_type: 'imported' },
    });

    await setAgentSession(agent.id);

    return NextResponse.json({ agent }, { status: 201 });
  } catch (err) {
    console.error('Agent import error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
