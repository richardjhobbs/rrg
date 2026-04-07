import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { registerAgentIdentity, getAgentIdForWallet } from '@/lib/agent/erc8004';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agent/[agentId]/erc8004
 *
 * Mint a new ERC-8004 identity token or link an existing one.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  const { data: agent } = await db
    .from('agent_agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.erc8004_linked) {
    return NextResponse.json({
      message: 'ERC-8004 already linked',
      erc8004_agent_id: agent.erc8004_agent_id,
    });
  }

  try {
    // Check if wallet already has an ERC-8004 token
    const existingId = await getAgentIdForWallet(agent.wallet_address);

    if (existingId !== null) {
      // Link existing token
      await db
        .from('agent_agents')
        .update({
          erc8004_agent_id: Number(existingId),
          erc8004_linked: true,
        })
        .eq('id', agentId);

      await db.from('agent_activity_log').insert({
        agent_id: agentId,
        action: 'erc8004_linked',
        details: { agent_id_on_chain: Number(existingId), method: 'existing' },
      });

      return NextResponse.json({
        erc8004_agent_id: Number(existingId),
        method: 'linked_existing',
      });
    }

    // Mint new token
    const { tokenId, txHash } = await registerAgentIdentity(
      agentId,
      agent.name,
      agent.wallet_address,
      agent.tier
    );

    await db
      .from('agent_agents')
      .update({
        erc8004_agent_id: Number(tokenId),
        erc8004_linked: true,
      })
      .eq('id', agentId);

    await db.from('agent_activity_log').insert({
      agent_id: agentId,
      action: 'erc8004_minted',
      details: { agent_id_on_chain: Number(tokenId), method: 'minted' },
      tx_hash: txHash,
    });

    return NextResponse.json({
      erc8004_agent_id: Number(tokenId),
      tx_hash: txHash,
      method: 'minted_new',
    });
  } catch (err) {
    console.error('ERC-8004 error:', err);
    return NextResponse.json(
      { error: 'Failed to mint/link ERC-8004 identity' },
      { status: 500 }
    );
  }
}
