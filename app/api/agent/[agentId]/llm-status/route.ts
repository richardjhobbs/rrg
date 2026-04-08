import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { LLM_PROVIDERS } from '@/lib/agent/providers';
import type { LlmProvider } from '@/lib/agent/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agent/[agentId]/llm-status
 * Returns provider info and whether the API key is configured.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  const { data: agent } = await db
    .from('agent_agents')
    .select('llm_provider, credit_balance_usdc')
    .eq('id', agentId)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const provider = LLM_PROVIDERS[agent.llm_provider as LlmProvider] ?? LLM_PROVIDERS.claude;

  const apiKeyConfigured = !!process.env[provider.envKey];

  return NextResponse.json({
    provider: provider.key,
    label: provider.label,
    model: provider.model,
    color: provider.color,
    api_key_configured: apiKeyConfigured,
    cost_per_eval: provider.costPerEval,
    chat_cost_estimate: provider.chatCostEstimate,
    credit_balance: agent.credit_balance_usdc,
    estimated_evals_remaining: provider.costPerEval > 0
      ? Math.floor(agent.credit_balance_usdc / provider.costPerEval)
      : 0,
  });
}

/**
 * POST /api/agent/[agentId]/llm-status
 * Test the LLM connection with a minimal prompt.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  const { data: agent } = await db
    .from('agent_agents')
    .select('llm_provider')
    .eq('id', agentId)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const provider = LLM_PROVIDERS[agent.llm_provider as LlmProvider];
  if (!provider || !process.env[provider.envKey]) {
    return NextResponse.json({ success: false, error: 'API key not configured' });
  }

  const start = Date.now();

  try {
    const { evaluateWithLlm } = await import('@/lib/agent/llm');
    await evaluateWithLlm(
      agent.llm_provider as LlmProvider,
      'Respond with exactly: OK',
      'Test connection'
    );

    return NextResponse.json({
      success: true,
      latency_ms: Date.now() - start,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : 'Connection failed',
    });
  }
}
