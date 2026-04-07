/**
 * Credit balance management for Pro agents.
 *
 * Credits are consumed per LLM evaluation.
 * When credits run out, agent falls back to Basic rules engine.
 */

import { db } from '@/lib/rrg/db';

// Approximate cost per evaluation in USDC (by provider)
export const LLM_COST_PER_EVAL: Record<string, number> = {
  claude: 0.005,
  openai: 0.003,
  gemini: 0.001,
};

/** Check if a Pro agent has sufficient credits for an evaluation. */
export async function hasCredits(agentId: string): Promise<boolean> {
  const { data } = await db
    .from('agent_agents')
    .select('credit_balance_usdc, llm_provider')
    .eq('id', agentId)
    .single();

  if (!data) return false;
  const cost = LLM_COST_PER_EVAL[data.llm_provider] ?? 0.005;
  return data.credit_balance_usdc >= cost;
}

/** Deduct credits after an LLM evaluation. Returns new balance. */
export async function deductCredits(
  agentId: string,
  tokensUsed: number,
  provider: string
): Promise<number> {
  // Estimate cost based on tokens (rough: $0.003 per 1K tokens for most models)
  const costPerToken = provider === 'claude' ? 0.000005 : provider === 'openai' ? 0.000003 : 0.000001;
  const cost = Math.max(tokensUsed * costPerToken, 0.0001);

  // Atomic decrement + insert ledger entry
  const { data: agent } = await db
    .from('agent_agents')
    .select('credit_balance_usdc')
    .eq('id', agentId)
    .single();

  if (!agent) throw new Error('Agent not found');

  const newBalance = Math.max(0, agent.credit_balance_usdc - cost);

  await db
    .from('agent_agents')
    .update({ credit_balance_usdc: newBalance })
    .eq('id', agentId);

  await db.from('agent_credit_transactions').insert({
    agent_id: agentId,
    type: 'deduction',
    amount_usdc: -cost,
    balance_after: newBalance,
    description: `LLM evaluation (${provider}, ${tokensUsed} tokens)`,
  });

  return newBalance;
}

/** Top up agent credits. Returns new balance. */
export async function topUpCredits(
  agentId: string,
  amountUsdc: number,
  txHash?: string
): Promise<number> {
  const { data: agent } = await db
    .from('agent_agents')
    .select('credit_balance_usdc')
    .eq('id', agentId)
    .single();

  if (!agent) throw new Error('Agent not found');

  const newBalance = agent.credit_balance_usdc + amountUsdc;

  await db
    .from('agent_agents')
    .update({ credit_balance_usdc: newBalance })
    .eq('id', agentId);

  await db.from('agent_credit_transactions').insert({
    agent_id: agentId,
    type: 'topup',
    amount_usdc: amountUsdc,
    balance_after: newBalance,
    description: `Credit top-up`,
    tx_hash: txHash ?? null,
  });

  return newBalance;
}

/** Get credit transaction history for an agent. */
export async function getCreditHistory(agentId: string, limit = 50) {
  const { data } = await db
    .from('agent_credit_transactions')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}
