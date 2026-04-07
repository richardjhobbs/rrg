import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { parseInstructions } from '@/lib/agent/rules';
import { setAgentSession } from '@/lib/agent/auth';
import type { AgentTier, BidAggression, LlmProvider, WalletType } from '@/lib/agent/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agent/create
 *
 * Register a new agent with an embedded Thirdweb wallet.
 * The wallet is created client-side via Thirdweb SDK — we receive the address.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      email,
      name,
      tier = 'basic',
      wallet_address,
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
      style_tags?: string[];
      free_instructions?: string | null;
      budget_ceiling_usdc?: number | null;
      bid_aggression?: BidAggression;
      llm_provider?: LlmProvider;
    };

    // Validate required fields
    if (!email || !name || !wallet_address) {
      return NextResponse.json(
        { error: 'email, name, and wallet_address are required' },
        { status: 400 }
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

    // Parse instructions into rules for Basic tier (or as fallback for Pro)
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
        wallet_type: 'embedded' as WalletType,
        llm_provider,
        credit_balance_usdc: 0,
        status: 'active',
      })
      .select('*')
      .single();

    if (error) {
      console.error('Agent creation error:', error);
      return NextResponse.json(
        { error: 'Failed to create agent' },
        { status: 500 }
      );
    }

    // Log activity
    await db.from('agent_activity_log').insert({
      agent_id: agent.id,
      action: 'agent_created',
      details: { tier, wallet_type: 'embedded' },
    });

    // Set session
    await setAgentSession(agent.id);

    return NextResponse.json({ agent }, { status: 201 });
  } catch (err) {
    console.error('Agent create error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
