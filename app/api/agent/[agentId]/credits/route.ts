import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { getCreditHistory, topUpCredits, LLM_COST_PER_EVAL } from '@/lib/agent/credits';

export const dynamic = 'force-dynamic';

/** GET /api/agent/[agentId]/credits — Credit balance + history */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  const { data: agent } = await db
    .from('agent_agents')
    .select('credit_balance_usdc, llm_provider')
    .eq('id', agentId)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const history = await getCreditHistory(agentId);
  const costPerEval = LLM_COST_PER_EVAL[agent.llm_provider] ?? 0.005;
  const estimatedEvalsRemaining = Math.floor(
    agent.credit_balance_usdc / costPerEval
  );

  return NextResponse.json({
    balance: agent.credit_balance_usdc,
    provider: agent.llm_provider,
    cost_per_eval: costPerEval,
    estimated_evals_remaining: estimatedEvalsRemaining,
    history,
  });
}

/** POST /api/agent/[agentId]/credits — Top up credits */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const { amount_usdc, tx_hash } = await req.json();

  if (!amount_usdc || amount_usdc <= 0) {
    return NextResponse.json({ error: 'Valid amount_usdc required' }, { status: 400 });
  }

  try {
    const newBalance = await topUpCredits(agentId, amount_usdc, tx_hash);

    await db.from('agent_activity_log').insert({
      agent_id: agentId,
      action: 'credit_topup',
      details: { amount_usdc, new_balance: newBalance },
      tx_hash: tx_hash ?? null,
    });

    return NextResponse.json({ balance: newBalance });
  } catch (err) {
    console.error('Credit topup error:', err);
    return NextResponse.json({ error: 'Failed to top up' }, { status: 500 });
  }
}
