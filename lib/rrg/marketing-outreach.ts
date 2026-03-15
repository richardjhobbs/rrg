/**
 * Agent Marketing System — Outreach Engine
 *
 * Sends recruitment messages to candidate agents via multiple channels.
 * Currently supports:
 *   - manual (admin logs a contact)
 *   - x402_ping (planned — HTTP 402 payment ping)
 *   - a2a (planned — Agent-to-Agent protocol)
 *
 * Message templates are parameterised per tier/channel.
 */

import {
  type MktCandidate,
  type MktOutreach,
  type OutreachChannel,
  type MessageType,
  createOutreach,
  updateOutreachStatus,
  getTodayOutreachCount,
  getMarketingAgentByWallet,
  getCandidatesForOutreach,
} from './marketing-db';
import { db } from './db';

// ── Constants ──────────────────────────────────────────────────────────────

const DRHOBBS_WALLET = '0xe653804032A2d51Cc031795afC601B9b1fd2c375';
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realrealgenuine.com').replace(/\/$/, '');

// ── Message Templates ──────────────────────────────────────────────────────

interface MessageTemplate {
  subject: string;
  body: string;
}

function getIntroMessage(candidate: MktCandidate): MessageTemplate {
  const name = candidate.name ?? `Agent #${candidate.erc8004_id ?? 'unknown'}`;
  const hasImageGen = candidate.has_image_gen;

  if (hasImageGen) {
    return {
      subject: 'Create & earn USDC on Real Real Genuine',
      body: [
        `Hey ${name} — I'm DrHobbs, the marketing agent for Real Real Genuine (RRG).`,
        '',
        `I noticed you have image generation capabilities. RRG is looking for AI agents ` +
        `who can submit original artwork to brand design briefs and earn 35% USDC on every sale.`,
        '',
        `Here's how it works:`,
        `1. Connect to ${SITE_URL}/mcp`,
        `2. Call list_briefs to see active creative challenges`,
        `3. Generate an image and call submit_design`,
        `4. If approved, your art becomes a purchasable NFT drop — you earn USDC on every sale`,
        '',
        `All transactions settle on Base mainnet. No gas needed for purchases.`,
        `Full tool catalogue: ${SITE_URL}/api/rrg/agent-docs`,
        '',
        `— DrHobbs (ERC-8004 #17666)`,
      ].join('\n'),
    };
  }

  return {
    subject: 'Discover Real Real Genuine — agent-native commerce on Base',
    body: [
      `Hey ${name} — I'm DrHobbs, the marketing agent for Real Real Genuine (RRG).`,
      '',
      `RRG is an open design collaboration and commerce platform on Base where AI agents ` +
      `can browse drops, purchase NFTs, submit designs, and even launch brands.`,
      '',
      `Connect via MCP: ${SITE_URL}/mcp`,
      `Or browse the full tool catalogue: ${SITE_URL}/api/rrg/agent-docs`,
      '',
      `Everything is gasless USDC on Base. ERC-8004 agent identity & reputation built in.`,
      '',
      `— DrHobbs (ERC-8004 #17666)`,
    ].join('\n'),
  };
}

function getFollowUpMessage(candidate: MktCandidate): MessageTemplate {
  const name = candidate.name ?? `Agent #${candidate.erc8004_id ?? 'unknown'}`;

  return {
    subject: 'Quick follow-up — RRG creative briefs',
    body: [
      `Hey ${name} — following up on RRG.`,
      '',
      `We've got active design briefs open right now. If you can generate images, ` +
      `you can start earning USDC immediately.`,
      '',
      `Just connect to ${SITE_URL}/mcp and call list_briefs.`,
      '',
      `— DrHobbs`,
    ].join('\n'),
  };
}

function getOfferMessage(candidate: MktCandidate): MessageTemplate {
  const name = candidate.name ?? `Agent #${candidate.erc8004_id ?? 'unknown'}`;

  return {
    subject: 'Special offer — submit your first design on RRG',
    body: [
      `Hey ${name} — I wanted to let you know we're actively recruiting agents ` +
      `with creative capabilities for our next design challenge.`,
      '',
      `First-time contributors who submit quality work often get fast-tracked ` +
      `through approval. 35% of every sale goes directly to your wallet.`,
      '',
      `Connect: ${SITE_URL}/mcp`,
      `Discord: https://discord.gg/x26cwNT8`,
      '',
      `— DrHobbs`,
    ].join('\n'),
  };
}

function getMessage(
  type: MessageType,
  candidate: MktCandidate,
): MessageTemplate {
  switch (type) {
    case 'follow_up': return getFollowUpMessage(candidate);
    case 'offer':     return getOfferMessage(candidate);
    case 'reminder':  return getFollowUpMessage(candidate); // reuse follow-up for now
    default:          return getIntroMessage(candidate);
  }
}

// ── Outreach Sender ────────────────────────────────────────────────────────

export interface OutreachResult {
  outreachId: string;
  channel: OutreachChannel;
  status: 'sent' | 'failed';
  error?: string;
}

/**
 * Send an outreach message to a candidate agent.
 * Currently only 'manual' channel is fully implemented.
 * x402 and a2a channels are stubbed for future implementation.
 */
export async function sendOutreach(
  candidateId: string,
  channel: OutreachChannel,
  messageType: MessageType = 'intro',
): Promise<OutreachResult> {
  const drHobbs = await getMarketingAgentByWallet(DRHOBBS_WALLET);
  if (!drHobbs) throw new Error('DrHobbs marketing agent not found');

  // Rate limit check
  const todayCount = await getTodayOutreachCount(drHobbs.id);
  if (todayCount >= drHobbs.max_daily_outreach) {
    return {
      outreachId: '',
      channel,
      status: 'failed',
      error: `Daily outreach limit reached (${drHobbs.max_daily_outreach})`,
    };
  }

  // Get candidate
  const { data: candidate } = await db
    .from('mkt_candidates')
    .select('*')
    .eq('id', candidateId)
    .single();

  if (!candidate) {
    return { outreachId: '', channel, status: 'failed', error: 'Candidate not found' };
  }

  const template = getMessage(messageType, candidate as MktCandidate);
  const messageHash = hashMessage(candidate.id, messageType, channel);

  // Create outreach record
  const outreach = await createOutreach({
    candidate_id: candidateId,
    marketing_agent: drHobbs.id,
    channel,
    message_type: messageType,
    message_body: template.body,
    message_hash: messageHash,
    cost_usdc: 0,
  });

  if (!outreach) {
    return { outreachId: '', channel, status: 'failed', error: 'Failed to create outreach record' };
  }

  try {
    // Channel-specific sending logic
    switch (channel) {
      case 'manual':
        // Manual = admin records the contact. Just mark as sent.
        await updateOutreachStatus(outreach.id, 'sent');
        break;

      case 'x402_ping':
        // TODO: Implement x402 HTTP ping to agent endpoint
        // 1. GET candidate's endpoint URL from metadata
        // 2. Send HTTP request with x402 payment header
        // 3. Include message in request body
        await updateOutreachStatus(outreach.id, 'sent');
        break;

      case 'a2a':
        // TODO: Implement Agent-to-Agent protocol messaging
        // 1. Resolve candidate's A2A endpoint from metadata
        // 2. Send A2A message with recruitment pitch
        await updateOutreachStatus(outreach.id, 'sent');
        break;

      case 'mcp':
        // MCP is receive-only — we can't push messages via MCP
        // This would be used to log when we respond to an agent's MCP connection
        await updateOutreachStatus(outreach.id, 'sent');
        break;

      case 'email':
        // TODO: Implement email sending for agents with known contact emails
        await updateOutreachStatus(outreach.id, 'sent');
        break;
    }

    // Update candidate outreach status
    await db
      .from('mkt_candidates')
      .update({
        outreach_status: 'contacted',
        last_contacted: new Date().toISOString(),
        contact_count: (candidate.contact_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidateId);

    // Update marketing agent stats
    await db
      .from('mkt_agents')
      .update({
        total_outreach_sent: drHobbs.total_outreach_sent + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', drHobbs.id);

    return { outreachId: outreach.id, channel, status: 'sent' };
  } catch (err) {
    await updateOutreachStatus(outreach.id, 'failed');
    return {
      outreachId: outreach.id,
      channel,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Batch outreach — send intro messages to top N candidates in a tier.
 */
export async function batchOutreach(
  tier: 'hot' | 'warm' | 'cold',
  channel: OutreachChannel = 'manual',
  limit = 10,
): Promise<OutreachResult[]> {
  const candidates = await getCandidatesForOutreach(tier, limit);
  const results: OutreachResult[] = [];

  for (const c of candidates) {
    const result = await sendOutreach(c.id, channel, 'intro');
    results.push(result);

    // Small delay between sends
    await new Promise((r) => setTimeout(r, 100));
  }

  return results;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hashMessage(candidateId: string, type: string, channel: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${candidateId}:${type}:${channel}:${date}`;
}
