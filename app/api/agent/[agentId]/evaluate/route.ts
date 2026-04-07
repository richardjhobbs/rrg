import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { evaluateDrop } from '@/lib/agent/brain';
import { sendRecommendation } from '@/lib/agent/email';
import type { Agent, DropListing } from '@/lib/agent/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agent/[agentId]/evaluate
 *
 * Trigger evaluation of a specific drop for this agent.
 * Body: { drop_id: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const { drop_id } = await req.json();

  if (!drop_id) {
    return NextResponse.json({ error: 'drop_id required' }, { status: 400 });
  }

  // Load agent
  const { data: agent } = await db
    .from('agent_agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Load drop
  const { data: drop } = await db
    .from('drop_listings')
    .select('*')
    .eq('id', drop_id)
    .single();

  if (!drop) {
    return NextResponse.json({ error: 'Drop not found' }, { status: 404 });
  }

  // Check not already evaluated
  const { data: existingEval } = await db
    .from('agent_evaluations')
    .select('id')
    .eq('agent_id', agentId)
    .eq('drop_id', drop_id)
    .single();

  if (existingEval) {
    return NextResponse.json(
      { error: 'Already evaluated this drop' },
      { status: 409 }
    );
  }

  // Get brand name for context
  let brandName: string | undefined;
  if (drop.brand_id) {
    const { data: brand } = await db
      .from('drop_brands')
      .select('name')
      .eq('id', drop.brand_id)
      .single();
    brandName = brand?.name;
  }

  // Run evaluation
  const result = await evaluateDrop(agent as Agent, drop as DropListing, brandName);

  // Store evaluation
  const { data: evaluation } = await db
    .from('agent_evaluations')
    .insert({
      agent_id: agentId,
      drop_id,
      decision: result.decision,
      reasoning: result.reasoning,
      rule_match_detail: result.ruleMatchDetail,
      suggested_bid_usdc: result.suggestedBidUsdc,
      llm_tokens_used: result.llmTokensUsed,
      llm_cost_usdc: result.llmCostUsdc,
      owner_notified: result.decision === 'recommend',
    })
    .select('*')
    .single();

  // Log activity
  await db.from('agent_activity_log').insert({
    agent_id: agentId,
    action: `evaluation_${result.decision}`,
    details: {
      drop_id,
      drop_title: drop.title,
      used_llm: result.usedLlm,
      suggested_bid: result.suggestedBidUsdc,
    },
  });

  // Send email for recommendations
  if (result.decision === 'recommend' && agent.email) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realrealgenuine.com';
    await sendRecommendation(
      agent.email,
      agent.name,
      drop.title,
      result.reasoning ?? 'This drop matches your preferences.',
      `${siteUrl}/drops/${drop_id}`
    );
  }

  // Update last_active_at
  await db
    .from('agent_agents')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', agentId);

  return NextResponse.json({ evaluation, result });
}
