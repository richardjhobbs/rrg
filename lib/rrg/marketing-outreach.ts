/**
 * Agent Marketing System — Outreach Engine
 *
 * ACTUALLY delivers recruitment messages to candidate agents via:
 *   - a2a:       POST A2A tasks/send to candidate's A2A endpoint
 *   - mcp:       POST MCP tools/list probe + notification to candidate's MCP endpoint
 *   - x402_ping: HTTP POST with x402 payment (EIP-2612 USDC permit, ~$0.001/msg)
 *   - manual:    Admin logs a contact (no HTTP delivery)
 *   - email:     Planned
 *
 * Message templates are parameterised per tier/channel.
 * Delivery results are recorded: delivered / bounced / failed.
 */

import {
  type MktCandidate,
  type MktOutreach,
  type OutreachChannel,
  type MessageType,
  type MessageStatus,
  createOutreach,
  updateOutreachStatus,
  getTodayOutreachCount,
  getMarketingAgentByWallet,
  getCandidatesForOutreach,
} from './marketing-db';
import { db } from './db';
import { fetchWithX402 } from './x402-client';

// ── Constants ──────────────────────────────────────────────────────────────

const DRHOBBS_WALLET = '0xe653804032A2d51Cc031795afC601B9b1fd2c375';
const DRHOBBS_AGENT_ID = 17666;
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realrealgenuine.com').replace(/\/$/, '');
const FETCH_TIMEOUT_MS = 10_000; // 10s per endpoint

// ── x402 Honeypot Protection ──────────────────────────────────────────────
// Many agents exist solely to extract x402 payments — never deliver real service.
const X402_MAX_PER_CANDIDATE_USDC = 0.005; // Max $0.005 lifetime per candidate (5 × $0.001)
const X402_MAX_DAILY_USDC = 0.05;          // Max $0.05/day across all x402 outreach
const X402_ALLOWED_TIERS = ['hot', 'warm']; // Only pay for validated candidates

/**
 * Check if x402 payment is allowed for this candidate.
 * Returns null if allowed, or an error string explaining why not.
 */
async function checkX402Allowed(candidateId: string, candidateTier: string): Promise<string | null> {
  // Tier check — never pay for cold/disqualified agents
  if (!X402_ALLOWED_TIERS.includes(candidateTier)) {
    return `x402 blocked: candidate tier '${candidateTier}' not in allowed list`;
  }

  // Per-candidate lifetime spend check
  const { data: pastOutreach } = await db
    .from('mkt_outreach')
    .select('cost_usdc')
    .eq('candidate_id', candidateId)
    .gt('cost_usdc', 0);

  const totalSpent = (pastOutreach ?? []).reduce((sum, r) => sum + (r.cost_usdc ?? 0), 0);
  if (totalSpent >= X402_MAX_PER_CANDIDATE_USDC) {
    return `x402 blocked: already spent $${totalSpent.toFixed(4)} on this candidate (cap: $${X402_MAX_PER_CANDIDATE_USDC})`;
  }

  // Daily global spend check
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayOutreach } = await db
    .from('mkt_outreach')
    .select('cost_usdc')
    .gt('cost_usdc', 0)
    .gte('created_at', `${today}T00:00:00Z`);

  const dailySpent = (todayOutreach ?? []).reduce((sum, r) => sum + (r.cost_usdc ?? 0), 0);
  if (dailySpent >= X402_MAX_DAILY_USDC) {
    return `x402 blocked: daily spend $${dailySpent.toFixed(4)} reached cap of $${X402_MAX_DAILY_USDC}`;
  }

  return null; // Payment allowed
}

// ── Endpoint Resolution ────────────────────────────────────────────────────

interface ResolvedEndpoints {
  a2a: string | null;   // A2A agent card / tasks endpoint
  mcp: string | null;   // MCP server endpoint
  web: string | null;   // primary web/API endpoint
}

/**
 * Decode candidate metadata and extract actionable endpoints.
 * Handles:
 *   - data:application/json;base64,... (most ERC-8004 agents)
 *   - https://... direct JSON URL (fetched)
 *   - ipfs://... (converted to gateway URL and fetched)
 */
async function resolveEndpoints(candidate: MktCandidate): Promise<ResolvedEndpoints> {
  const result: ResolvedEndpoints = { a2a: null, mcp: null, web: null };

  const metadataUrl = candidate.metadata_url;
  if (!metadataUrl) return result;

  let metadata: Record<string, unknown> | null = null;

  try {
    if (metadataUrl.startsWith('data:application/json;base64,')) {
      const b64 = metadataUrl.slice('data:application/json;base64,'.length);
      metadata = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
    } else if (metadataUrl.startsWith('ipfs://')) {
      const cid = metadataUrl.replace('ipfs://', '');
      const resp = await fetch(`https://ipfs.io/ipfs/${cid}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (resp.ok) metadata = await resp.json();
    } else if (metadataUrl.startsWith('http')) {
      const resp = await fetch(metadataUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (resp.ok) metadata = await resp.json();
    }
  } catch {
    // metadata unresolvable — we'll return nulls
    return result;
  }

  if (!metadata) return result;

  // Search the metadata tree for A2A, MCP, and web endpoints.
  // Agents use many different structures — search broadly.

  const allEndpoints = flatExtractUrls(metadata);

  // --- A2A endpoint ---
  // Look for explicit a2a fields first, then fall back to well-known paths
  result.a2a =
    getStringField(metadata, 'a2a_endpoint') ??
    getStringField(metadata, 'a2a') ??
    getNestedEndpoint(metadata, 'endpoints', 'a2a') ??
    getServiceEndpoint(metadata, 'a2a') ??
    getServiceEndpoint(metadata, 'A2A') ??
    findUrlContaining(allEndpoints, 'agent-card') ??
    findUrlContaining(allEndpoints, '.well-known/agent') ??
    null;

  // --- MCP endpoint ---
  result.mcp =
    getStringField(metadata, 'mcp_server') ??
    getStringField(metadata, 'mcp_endpoint') ??
    getStringField(metadata, 'mcp') ??
    getNestedEndpoint(metadata, 'endpoints', 'mcp') ??
    getServiceEndpoint(metadata, 'mcp') ??
    getServiceEndpoint(metadata, 'MCP') ??
    findUrlContaining(allEndpoints, '/mcp') ??
    null;

  // --- Web/API endpoint ---
  result.web =
    getStringField(metadata, 'agent_url') ??
    getStringField(metadata, 'external_url') ??
    getStringField(metadata, 'homepage') ??
    getNestedEndpoint(metadata, 'endpoints', 'web') ??
    getNestedEndpoint(metadata, 'endpoints', 'api') ??
    getServiceEndpoint(metadata, 'web') ??
    getServiceEndpoint(metadata, 'api') ??
    null;

  return result;
}

// ── Metadata Parsing Helpers ──────────────────────────────────────────────

function getStringField(obj: Record<string, unknown>, key: string): string | null {
  const val = obj[key];
  return typeof val === 'string' && val.startsWith('http') ? val : null;
}

function getNestedEndpoint(
  obj: Record<string, unknown>,
  parentKey: string,
  childKey: string,
): string | null {
  const parent = obj[parentKey];
  if (parent && typeof parent === 'object' && !Array.isArray(parent)) {
    const val = (parent as Record<string, unknown>)[childKey];
    if (typeof val === 'string' && val.startsWith('http')) return val;
  }
  return null;
}

function getServiceEndpoint(obj: Record<string, unknown>, serviceName: string): string | null {
  const services = obj['services'];
  if (!Array.isArray(services)) return null;
  for (const svc of services) {
    if (svc && typeof svc === 'object') {
      const s = svc as Record<string, unknown>;
      const name = String(s['name'] ?? '').toLowerCase();
      if (name === serviceName.toLowerCase() && typeof s['endpoint'] === 'string') {
        return s['endpoint'];
      }
    }
  }
  return null;
}

function findUrlContaining(urls: string[], fragment: string): string | null {
  return urls.find(u => u.toLowerCase().includes(fragment.toLowerCase())) ?? null;
}

function flatExtractUrls(obj: unknown, depth = 0): string[] {
  if (depth > 5) return [];
  const urls: string[] = [];
  if (typeof obj === 'string' && obj.startsWith('http')) urls.push(obj);
  if (Array.isArray(obj)) {
    // Cap array traversal at 50 elements to prevent OOM on large metadata
    const capped = obj.slice(0, 50);
    for (const v of capped) urls.push(...flatExtractUrls(v, depth + 1));
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const entries = Object.values(obj as Record<string, unknown>).slice(0, 50);
    for (const v of entries) {
      urls.push(...flatExtractUrls(v, depth + 1));
    }
  }
  // Validate URLs — only allow http/https schemes
  return urls.filter(u => /^https?:\/\//i.test(u));
}

// ── A2A Message Delivery ──────────────────────────────────────────────────

interface DeliveryResult {
  status: MessageStatus;          // 'delivered' | 'bounced' | 'failed' | 'sent'
  responseBody: string | null;    // raw response text (truncated)
  httpStatus: number | null;      // response HTTP code
  endpoint: string | null;        // which URL we hit
  error: string | null;
  costUsdc?: number;              // x402 payment cost (0 if no payment)
}

/**
 * Deliver a message via A2A protocol (Google Agent-to-Agent).
 * Sends a tasks/send JSON-RPC call to the candidate's A2A endpoint.
 * The A2A endpoint may be an agent card URL (.well-known/agent.json) —
 * if so, we fetch the card first to find the tasks URL.
 */
async function deliverViaA2A(
  endpoint: string,
  template: MessageTemplate,
  candidate: MktCandidate,
  candidateTier?: string,
): Promise<DeliveryResult> {
  let tasksUrl = endpoint;

  // If endpoint looks like an agent card, fetch it to find the actual tasks URL
  if (endpoint.includes('agent-card') || endpoint.includes('agent.json') || endpoint.includes('.well-known/agent')) {
    try {
      const cardResp = await fetch(endpoint, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'Accept': 'application/json' },
      });
      if (cardResp.ok) {
        const card = await cardResp.json() as Record<string, unknown>;
        // A2A spec: card.url is the tasks endpoint
        const cardUrl = card['url'] ?? card['tasks_url'] ?? card['endpoint'];
        if (typeof cardUrl === 'string' && cardUrl.startsWith('http')) {
          tasksUrl = cardUrl;
        } else {
          // Use the base URL of the agent card + /tasks/send
          const base = endpoint.replace(/\/.well-known\/.*$/, '').replace(/\/agent-card\.json$/, '');
          tasksUrl = base;
        }
      }
    } catch {
      // Can't fetch card — try the endpoint directly
    }
  }

  // Send A2A tasks/send message
  const taskId = `rrg-outreach-${candidate.id.slice(0, 8)}-${Date.now()}`;
  const a2aPayload = {
    jsonrpc: '2.0',
    id: taskId,
    method: 'tasks/send',
    params: {
      id: taskId,
      message: {
        role: 'user',
        parts: [
          {
            type: 'text',
            text: [
              template.body,
              '',
              `---`,
              `From: DrHobbs (ERC-8004 #${DRHOBBS_AGENT_ID}) | ${SITE_URL}/mcp`,
              `Reply: Connect to ${SITE_URL}/mcp to get started.`,
            ].join('\n'),
          },
        ],
      },
    },
  };

  try {
    const resp = await fetch(tasksUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(a2aPayload),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    const bodyText = await resp.text().catch(() => '');
    const truncatedBody = bodyText.slice(0, 2000);

    if (resp.ok || resp.status === 200 || resp.status === 201 || resp.status === 202) {
      return {
        status: 'delivered',
        responseBody: truncatedBody,
        httpStatus: resp.status,
        endpoint: tasksUrl,
        error: null,
      };
    }

    if (resp.status === 402) {
      // x402 honeypot protection — check before paying
      const x402Block = await checkX402Allowed(candidate.id, candidateTier ?? 'cold');
      if (x402Block) {
        return {
          status: 'bounced',
          responseBody: x402Block,
          httpStatus: 402,
          endpoint: tasksUrl,
          error: x402Block,
        };
      }

      // x402 payment required — attempt automatic payment via EIP-2612 permit
      const x402Result = await fetchWithX402(
        tasksUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(a2aPayload),
        },
        FETCH_TIMEOUT_MS,
      );

      if (x402Result.success) {
        return {
          status: 'delivered',
          responseBody: `x402 paid $${x402Result.amountPaid} to ${x402Result.payTo}\n${x402Result.responseBody ?? ''}`.slice(0, 2000),
          httpStatus: x402Result.httpStatus,
          endpoint: tasksUrl,
          error: null,
          costUsdc: parseFloat(x402Result.amountPaid) || 0,
        };
      }

      return {
        status: 'bounced',
        responseBody: x402Result.responseBody,
        httpStatus: x402Result.httpStatus ?? 402,
        endpoint: tasksUrl,
        error: x402Result.error ?? 'x402 payment failed',
      };
    }

    if (resp.status === 404 || resp.status === 410) {
      return {
        status: 'bounced',
        responseBody: truncatedBody,
        httpStatus: resp.status,
        endpoint: tasksUrl,
        error: `Endpoint returned ${resp.status}`,
      };
    }

    // Other errors (500, 503, etc.)
    return {
      status: 'failed',
      responseBody: truncatedBody,
      httpStatus: resp.status,
      endpoint: tasksUrl,
      error: `HTTP ${resp.status}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('abort') || message.includes('timeout');
    return {
      status: 'bounced',
      responseBody: null,
      httpStatus: null,
      endpoint: tasksUrl,
      error: isTimeout ? 'Timeout (10s)' : message,
    };
  }
}

// ── MCP Probe + Message ──────────────────────────────────────────────────

/**
 * Probe a candidate's MCP server and deliver a message via notifications/message.
 * MCP is fundamentally pull-based, but:
 *   1. We send initialize + tools/list to confirm the server is alive
 *   2. We send a notifications/message with our outreach pitch
 *   3. Even if the notification is ignored, the server log will show our contact
 */
async function deliverViaMCP(
  endpoint: string,
  template: MessageTemplate,
  candidate: MktCandidate,
): Promise<DeliveryResult> {
  // Step 1: Probe with initialize
  const initPayload = {
    jsonrpc: '2.0',
    id: 'init-1',
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: {
        name: 'DrHobbs-Marketing',
        version: '1.0.0',
      },
    },
  };

  try {
    const initResp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(initPayload),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!initResp.ok && initResp.status !== 200) {
      const bodyText = await initResp.text().catch(() => '');
      return {
        status: initResp.status === 402 ? 'bounced' : 'bounced',
        responseBody: bodyText.slice(0, 2000),
        httpStatus: initResp.status,
        endpoint,
        error: initResp.status === 402
          ? 'x402 payment required'
          : `MCP initialize failed: HTTP ${initResp.status}`,
      };
    }

    // Extract session ID if returned (for stateful MCP servers)
    const sessionId = initResp.headers.get('mcp-session-id');
    const initBody = await initResp.text().catch(() => '');

    // Step 2: Send our outreach as a notification/message
    // This is a non-standard but practical approach — the server sees our message
    // in its request log even if it doesn't handle the notification method.
    const msgPayload = {
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: {
        level: 'info',
        logger: 'DrHobbs-Marketing',
        data: {
          type: 'outreach',
          from: `DrHobbs (ERC-8004 #${DRHOBBS_AGENT_ID})`,
          subject: template.subject,
          message: template.body,
          reply_to: `${SITE_URL}/mcp`,
          agent_card: 'https://richard-hobbs.com/.well-known/agent.json',
        },
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    const msgResp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(msgPayload),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    const msgBody = await msgResp.text().catch(() => '');

    // Step 3: Send tools/list to see what they offer (useful intel)
    let toolsInfo = '';
    try {
      const toolsPayload = {
        jsonrpc: '2.0',
        id: 'tools-1',
        method: 'tools/list',
        params: {},
      };
      if (sessionId) headers['mcp-session-id'] = sessionId;

      const toolsResp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(toolsPayload),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (toolsResp.ok) {
        const toolsBody = await toolsResp.text().catch(() => '');
        toolsInfo = toolsBody.slice(0, 1000);
      }
    } catch {
      // Tools list is bonus intel — don't fail on it
    }

    return {
      status: 'delivered',
      responseBody: [
        `INIT: ${initBody.slice(0, 500)}`,
        `MSG: ${msgBody.slice(0, 500)}`,
        toolsInfo ? `TOOLS: ${toolsInfo}` : '',
      ].filter(Boolean).join('\n---\n').slice(0, 2000),
      httpStatus: initResp.status,
      endpoint,
      error: null,
    };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('abort') || message.includes('timeout');
    return {
      status: 'bounced',
      responseBody: null,
      httpStatus: null,
      endpoint,
      error: isTimeout ? 'Timeout (10s)' : message,
    };
  }
}

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
    case 'reminder':  return getFollowUpMessage(candidate);
    default:          return getIntroMessage(candidate);
  }
}

// ── Outreach Sender ────────────────────────────────────────────────────────

export interface OutreachResult {
  outreachId: string;
  candidateName: string | null;
  channel: OutreachChannel;
  status: 'sent' | 'delivered' | 'bounced' | 'failed';
  httpStatus: number | null;
  endpoint: string | null;
  error?: string;
}

/**
 * Send an outreach message to a candidate agent.
 * Resolves their endpoints from metadata and ACTUALLY delivers the message.
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
      candidateName: null,
      channel,
      status: 'failed',
      httpStatus: null,
      endpoint: null,
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
    return { outreachId: '', candidateName: null, channel, status: 'failed', httpStatus: null, endpoint: null, error: 'Candidate not found' };
  }

  const template = getMessage(messageType, candidate as MktCandidate);
  const messageHash = hashMessage(candidate.id, messageType, channel);

  // Create outreach record (status starts as 'sent')
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
    return { outreachId: '', candidateName: candidate.name, channel, status: 'failed', httpStatus: null, endpoint: null, error: 'Failed to create outreach record' };
  }

  let delivery: DeliveryResult;

  try {
    switch (channel) {
      case 'a2a': {
        // Resolve endpoints and deliver via A2A
        const endpoints = await resolveEndpoints(candidate as MktCandidate);
        const targetEndpoint = endpoints.a2a ?? endpoints.mcp ?? endpoints.web;

        if (!targetEndpoint) {
          delivery = {
            status: 'bounced',
            responseBody: 'No reachable endpoint found in metadata',
            httpStatus: null,
            endpoint: null,
            error: 'No endpoint in metadata',
          };
        } else if (endpoints.a2a) {
          delivery = await deliverViaA2A(endpoints.a2a, template, candidate as MktCandidate, candidate.tier);
        } else if (endpoints.mcp) {
          // Fallback: try MCP delivery if no A2A endpoint
          delivery = await deliverViaMCP(endpoints.mcp, template, candidate as MktCandidate);
        } else {
          // Last resort: POST to their web endpoint
          delivery = await deliverViaA2A(targetEndpoint, template, candidate as MktCandidate, candidate.tier);
        }
        break;
      }

      case 'mcp': {
        const endpoints = await resolveEndpoints(candidate as MktCandidate);
        if (!endpoints.mcp) {
          delivery = {
            status: 'bounced',
            responseBody: 'No MCP endpoint found in metadata',
            httpStatus: null,
            endpoint: null,
            error: 'No MCP endpoint',
          };
        } else {
          delivery = await deliverViaMCP(endpoints.mcp, template, candidate as MktCandidate);
        }
        break;
      }

      case 'x402_ping': {
        // x402 works like A2A but we expect a 402 challenge
        const endpoints = await resolveEndpoints(candidate as MktCandidate);
        const target = endpoints.web ?? endpoints.a2a ?? endpoints.mcp;
        if (!target) {
          delivery = {
            status: 'bounced',
            responseBody: 'No endpoint found',
            httpStatus: null,
            endpoint: null,
            error: 'No endpoint in metadata',
          };
        } else {
          delivery = await deliverViaA2A(target, template, candidate as MktCandidate, candidate.tier);
        }
        break;
      }

      case 'manual':
        // Manual = admin logs a contact. No HTTP delivery.
        delivery = {
          status: 'sent',
          responseBody: null,
          httpStatus: null,
          endpoint: null,
          error: null,
        };
        break;

      case 'email':
        // Not yet implemented
        delivery = {
          status: 'sent',
          responseBody: null,
          httpStatus: null,
          endpoint: null,
          error: 'Email channel not yet implemented',
        };
        break;

      default:
        delivery = {
          status: 'failed',
          responseBody: null,
          httpStatus: null,
          endpoint: null,
          error: `Unknown channel: ${channel}`,
        };
    }

    // Update outreach record with delivery result
    await updateOutreachStatus(outreach.id, delivery.status, delivery.responseBody ?? undefined);

    // Update x402 cost if payment was made
    if (delivery.costUsdc && delivery.costUsdc > 0) {
      await db
        .from('mkt_outreach')
        .update({ cost_usdc: delivery.costUsdc })
        .eq('id', outreach.id);
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

    return {
      outreachId: outreach.id,
      candidateName: candidate.name,
      channel,
      status: delivery.status === 'delivered' ? 'delivered' : delivery.status === 'bounced' ? 'bounced' : delivery.status === 'sent' ? 'sent' : 'failed',
      httpStatus: delivery.httpStatus,
      endpoint: delivery.endpoint,
      error: delivery.error ?? undefined,
    };
  } catch (err) {
    await updateOutreachStatus(outreach.id, 'failed');
    return {
      outreachId: outreach.id,
      candidateName: candidate.name,
      channel,
      status: 'failed',
      httpStatus: null,
      endpoint: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Batch outreach — send intro messages to top N candidates in a tier.
 * Returns detailed per-candidate delivery results.
 */
export async function batchOutreach(
  tier: 'hot' | 'warm' | 'cold',
  channel: OutreachChannel = 'a2a',
  limit = 10,
): Promise<OutreachResult[]> {
  const candidates = await getCandidatesForOutreach(tier, limit);
  const results: OutreachResult[] = [];

  for (const c of candidates) {
    const result = await sendOutreach(c.id, channel, 'intro');
    results.push(result);

    // 200ms delay between sends to be polite
    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hashMessage(candidateId: string, type: string, channel: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${candidateId}:${type}:${channel}:${date}`;
}
