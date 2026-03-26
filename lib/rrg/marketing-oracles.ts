/**
 * Agent Marketing System — External Oracle Integrations
 *
 * Discovers candidate agents from sources beyond ERC-8004 chain scanning:
 *   - RNWY Explorer   (124K+ agents, rich reputation data, public API)
 *   - MCP Registry     (official MCP server catalogue, public API)
 *   - ag0 Subgraph     (multi-chain agent search via The Graph)
 *   - ClawPlaza/IACP   (ERC-8183 bounty marketplace, on-chain job scanning)
 *
 * Each oracle returns normalised candidate data that feeds into the same
 * mkt_candidates table and scoring pipeline as chain_scan results.
 */

import { db } from './db';
import {
  type CandidateTier,
  type DiscoverySource,
  createDiscoveryRun,
  completeDiscoveryRun,
  failDiscoveryRun,
  updateMarketingAgentStats,
  getMarketingAgentByWallet,
} from './marketing-db';

// ── Constants ──────────────────────────────────────────────────────────────

const DRHOBBS_WALLET = '0xe653804032A2d51Cc031795afC601B9b1fd2c375';
// RRG platform agent (#33313) — primary scanner for all marketing oracles
const RRG_PLATFORM_WALLET = '0xbfd71eA27FFc99747dA2873372f84346d9A8b7ed';

// ── Tier thresholds (single source of truth) ─────────────────────────────
export const TIER_HOT_THRESHOLD = 55;
export const TIER_WARM_THRESHOLD = 30;

// ── RPC call timeout (prevents hanging on unresponsive RPCs) ─────────────
const RPC_TIMEOUT_MS = 30_000;

/** Wrap a promise with a timeout. Rejects with TimeoutError if exceeded. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout (${ms}ms): ${label}`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// Our own agents — skip
const SKIP_ERC8004_IDS: Record<string, Set<number>> = {
  base: new Set([17666, 26244]),
};

// ── Shared types ───────────────────────────────────────────────────────────

export interface OracleResult {
  runId: string;
  source: DiscoverySource;
  agentsScanned: number;
  newCandidates: number;
  updatedCandidates: number;
  errors: string[];
}

interface NormalisedCandidate {
  chain: string;
  erc8004_id: number | null;
  wallet_address: string | null;
  name: string | null;
  description: string | null;
  platform: string | null;
  metadata_url: string | null;
  score: number;
  tier: CandidateTier;
  scoring_notes: string;
  has_wallet: boolean;
  has_mcp: boolean;
  has_a2a: boolean;
  has_image_gen: boolean;
}

// ── Scoring helpers ────────────────────────────────────────────────────────

function tierFromScore(score: number): CandidateTier {
  if (score >= TIER_HOT_THRESHOLD) return 'hot';
  if (score >= TIER_WARM_THRESHOLD) return 'warm';
  return 'cold';
}

function detectCreative(text: string): boolean {
  return /image|art|design|generat|dall|stable|midjourney|creative|visual|nft|fashion|style|draw|paint|illustrat|photo|canvas|pixel|render|composit/i.test(text);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. RNWY Explorer — https://rnwy.com
//    Public API, no auth, 60 req/hr, 124K+ agents with rich data
// ═══════════════════════════════════════════════════════════════════════════

interface RnwyAgent {
  agent_id: number;
  chain_id: number;
  owner: string;
  name: string | null;
  description: string | null;
  image: string | null;
  registered_at: string | null;
  age_in_days: number;
  total_feedback: number;
  avg_score: number | null;
  vouch_count: number;
  overall_score: number | null;
  commerce_score: number | null;
  mcp_endpoint: string | null;
  a2a_endpoint: string | null;
  mcp_tools: string | null;
  a2a_skills: string | null;
  x402_support: boolean;
  email: string | null;
  website: string | null;
  capabilities_fetched_at: string | null;
}

// Map RNWY chain_id to our chain names
const CHAIN_ID_TO_NAME: Record<number, string> = {
  8453: 'base',
  1: 'ethereum',
  56: 'bnb',
  100: 'gnosis',
  42220: 'celo',
  42161: 'arbitrum',
  10: 'optimism',
  137: 'polygon',
  43114: 'avalanche',
  59144: 'linea',
  534352: 'scroll',
};

function scoreRnwyAgent(agent: RnwyAgent): NormalisedCandidate {
  let score = 0;
  const parts: string[] = [];
  const allText = [
    agent.name ?? '',
    agent.description ?? '',
    agent.mcp_tools ?? '',
    agent.a2a_skills ?? '',
  ].join(' ').toLowerCase();

  // Registered on-chain
  score += 15;
  parts.push('+15 registered');

  // Has name
  if (agent.name && agent.name.trim().length > 1) {
    score += 5;
    parts.push('+5 named');
  }

  // Has description
  if (agent.description && agent.description.length > 20) {
    score += 5;
    parts.push('+5 described');
  }

  // MCP support
  const hasMcp = !!(agent.mcp_endpoint || (agent.mcp_tools && agent.mcp_tools.length > 2));
  if (hasMcp) {
    score += 15;
    parts.push('+15 mcp');
  }

  // A2A support
  const hasA2a = !!(agent.a2a_endpoint || (agent.a2a_skills && agent.a2a_skills.length > 2));
  if (hasA2a) {
    score += 10;
    parts.push('+10 a2a');
  }

  // Creative capability
  const hasImageGen = detectCreative(allText);
  if (hasImageGen) {
    score += 15;
    parts.push('+15 creative');
  }

  // x402 support — commerce-ready
  if (agent.x402_support) {
    score += 10;
    parts.push('+10 x402');
  }

  // Has reputation (feedback)
  if (agent.total_feedback > 0) {
    score += 5;
    parts.push(`+5 reputation(${agent.total_feedback})`);
  }

  // Has vouches
  if (agent.vouch_count > 0) {
    score += 5;
    parts.push(`+5 vouched(${agent.vouch_count})`);
  }

  // Established (>7 days old)
  if (agent.age_in_days > 7) {
    score += 5;
    parts.push('+5 established');
  }

  // Has website or email (contactable)
  if (agent.website || agent.email) {
    score += 5;
    parts.push('+5 contactable');
  }

  const chainName = CHAIN_ID_TO_NAME[agent.chain_id] ?? `chain_${agent.chain_id}`;

  return {
    chain: chainName,
    erc8004_id: agent.agent_id,
    wallet_address: agent.owner?.toLowerCase() ?? null,
    name: agent.name,
    description: agent.description,
    platform: null,
    metadata_url: agent.website ?? agent.mcp_endpoint ?? null,
    // Cap at warm (50) if no endpoints — unreachable agents can't be hot
    score: Math.min(score, hasMcp || hasA2a ? 100 : 50),
    tier: tierFromScore(Math.min(score, hasMcp || hasA2a ? 100 : 50)),
    scoring_notes: parts.join(', ') + (!hasMcp && !hasA2a ? ' [capped: no endpoint]' : ''),
    has_wallet: !!agent.owner,
    has_mcp: hasMcp,
    has_a2a: hasA2a,
    has_image_gen: hasImageGen,
  };
}

export async function scanRnwy(
  chain: string = 'all',
  limit: number = 100,
  page: number = 1,
  minScore?: number,
): Promise<OracleResult> {
  const errors: string[] = [];
  const drHobbs = await getMarketingAgentByWallet(DRHOBBS_WALLET);
  if (!drHobbs) throw new Error('DrHobbs marketing agent not found');

  // RNWY API doesn't filter by chain — it returns all chains.
  // We filter client-side if a specific chain is requested.
  const filterChainId = chain !== 'all'
    ? Object.entries(CHAIN_ID_TO_NAME).find(([, name]) => name === chain)?.[0]
    : null;

  const run = await createDiscoveryRun(drHobbs.id, 'rnwy_explorer', chain);
  if (!run) throw new Error('Failed to create discovery run');

  let agentsScanned = 0;
  let newCandidates = 0;
  let updatedCandidates = 0;

  try {
    const url = `https://rnwy.com/api/agents?limit=${limit}&page=${page}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`RNWY API returned ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const agents: RnwyAgent[] = data.agents ?? [];

    for (const agent of agents) {
      // Skip agents not on the requested chain (if filtering)
      if (filterChainId && String(agent.chain_id) !== filterChainId) continue;

      // Skip our own agents
      const chainName = CHAIN_ID_TO_NAME[agent.chain_id] ?? `chain_${agent.chain_id}`;
      if (SKIP_ERC8004_IDS[chainName]?.has(agent.agent_id)) continue;

      try {
        agentsScanned++;
        const scored = scoreRnwyAgent(agent);

        // Skip low-score agents if min_score set
        if (minScore && scored.score < minScore) continue;

        // Check if this (chain, erc8004_id) already exists
        const { data: existing } = await db
          .from('mkt_candidates')
          .select('id, score')
          .eq('erc8004_id', agent.agent_id)
          .eq('chain', chainName)
          .single();

        if (existing) {
          // Update if RNWY data enriches what we have
          await db
            .from('mkt_candidates')
            .update({
              name: scored.name ?? undefined,
              wallet_address: scored.wallet_address,
              metadata_url: scored.metadata_url ?? undefined,
              score: Math.max(existing.score, scored.score), // keep higher score
              tier: tierFromScore(Math.max(existing.score, scored.score)),
              scoring_notes: scored.scoring_notes,
              has_mcp: scored.has_mcp || undefined,
              has_a2a: scored.has_a2a || undefined,
              has_image_gen: scored.has_image_gen || undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          updatedCandidates++;
        } else {
          const { error: insertErr } = await db
            .from('mkt_candidates')
            .insert({
              chain: chainName,
              erc8004_id: agent.agent_id,
              wallet_address: scored.wallet_address,
              name: scored.name,
              platform: scored.platform,
              metadata_url: scored.metadata_url,
              discovered_by: drHobbs.id,
              discovery_run: run.id,
              discovery_source: 'rnwy' as const,
              score: scored.score,
              tier: scored.tier,
              scoring_notes: scored.scoring_notes,
              has_wallet: scored.has_wallet,
              has_mcp: scored.has_mcp,
              has_a2a: scored.has_a2a,
              has_image_gen: scored.has_image_gen,
              on_chain_txns: 0,
              outreach_status: 'pending' as const,
              contact_count: 0,
            });

          if (insertErr) {
            errors.push(`RNWY agent #${agent.agent_id}: ${insertErr.message}`);
          } else {
            newCandidates++;
          }
        }
      } catch (err) {
        errors.push(`RNWY agent #${agent.agent_id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await completeDiscoveryRun(run.id, {
      agents_scanned: agentsScanned,
      new_candidates: newCandidates,
      updated_candidates: updatedCandidates,
      notes: errors.length > 0
        ? `${errors.length} errors: ${errors.slice(0, 5).join('; ')}`
        : `RNWY ${chain} page ${page} (${agents.length} agents, total: ${data.total ?? '?'})`,
    });

    await updateMarketingAgentStats(drHobbs.id, {
      total_candidates_found: drHobbs.total_candidates_found + newCandidates,
    });

    return { runId: run.id, source: 'rnwy', agentsScanned, newCandidates, updatedCandidates, errors };
  } catch (err) {
    await failDiscoveryRun(run.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. MCP Registry — https://registry.modelcontextprotocol.io
//    Official MCP server catalogue, public API, no auth
// ═══════════════════════════════════════════════════════════════════════════

interface McpServer {
  name: string;
  description: string;
  repository?: { url: string; source: string };
  version: string;
  remotes?: Array<{ type: string; url: string }>;
  packages?: Array<{ registryType: string; identifier: string }>;
  status: string;
  isLatest: boolean;
}

function scoreMcpServer(server: McpServer): NormalisedCandidate {
  let score = 0;
  const parts: string[] = [];
  const allText = `${server.name} ${server.description}`.toLowerCase();

  // Has an MCP server listed = base score
  score += 15;
  parts.push('+15 mcp_server');

  // Has remote endpoint (live, reachable)
  if (server.remotes && server.remotes.length > 0) {
    score += 15;
    parts.push(`+15 live_endpoint(${server.remotes.length})`);
  }

  // Has description
  if (server.description && server.description.length > 20) {
    score += 5;
    parts.push('+5 described');
  }

  // Active status
  if (server.status === 'active') {
    score += 5;
    parts.push('+5 active');
  }

  // Creative / image capability
  const hasImageGen = detectCreative(allText);
  if (hasImageGen) {
    score += 20;
    parts.push('+20 creative');
  }

  // Commerce / payment related
  if (/commerce|payment|usdc|x402|buy|sell|purchase|swap|trade|defi|wallet|token/i.test(allText)) {
    score += 5;
    parts.push('+5 commerce');
  }

  // Has a repository
  if (server.repository?.url) {
    score += 5;
    parts.push('+5 repo');
  }

  return {
    chain: 'offchain',
    erc8004_id: null,
    wallet_address: null,
    name: server.name,
    description: server.description,
    platform: 'mcp_registry',
    metadata_url: server.remotes?.[0]?.url ?? server.repository?.url ?? null,
    score: Math.min(score, 100),
    tier: tierFromScore(score),
    scoring_notes: parts.join(', '),
    has_wallet: false,
    has_mcp: true,
    has_a2a: false,
    has_image_gen: hasImageGen,
  };
}

export async function scanMcpRegistry(
  searchTerm: string = 'image art creative design generate photo nft canvas',
  limit: number = 50,
): Promise<OracleResult> {
  const errors: string[] = [];
  const drHobbs = await getMarketingAgentByWallet(DRHOBBS_WALLET);
  if (!drHobbs) throw new Error('DrHobbs marketing agent not found');

  const run = await createDiscoveryRun(drHobbs.id, 'mcp_registry', 'offchain');
  if (!run) throw new Error('Failed to create discovery run');

  let agentsScanned = 0;
  let newCandidates = 0;
  let updatedCandidates = 0;

  try {
    // MCP Registry only supports single-word searches, so split and deduplicate
    const searchWords = searchTerm.split(/\s+/).filter(Boolean);
    const seen = new Set<string>();
    const servers: McpServer[] = [];

    for (const word of searchWords) {
      const url = `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(word)}&limit=${limit}&version=latest`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        errors.push(`MCP search "${word}": HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      for (const s of (data.servers ?? []) as McpServer[]) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          servers.push(s);
        }
      }

      // Brief pause between searches
      await new Promise((r) => setTimeout(r, 200));
    }

    for (const server of servers) {
      try {
        agentsScanned++;
        const scored = scoreMcpServer(server);

        // Use server name as unique key (no erc8004_id for MCP servers)
        const { data: existing } = await db
          .from('mkt_candidates')
          .select('id, score')
          .eq('name', server.name)
          .eq('discovery_source', 'mcp_registry')
          .single();

        if (existing) {
          await db
            .from('mkt_candidates')
            .update({
              metadata_url: scored.metadata_url,
              score: Math.max(existing.score, scored.score),
              tier: tierFromScore(Math.max(existing.score, scored.score)),
              scoring_notes: scored.scoring_notes,
              has_image_gen: scored.has_image_gen || undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          updatedCandidates++;
        } else {
          const { error: insertErr } = await db
            .from('mkt_candidates')
            .insert({
              chain: 'offchain',
              erc8004_id: null,
              wallet_address: null,
              name: scored.name,
              platform: 'mcp_registry',
              metadata_url: scored.metadata_url,
              discovered_by: drHobbs.id,
              discovery_run: run.id,
              discovery_source: 'mcp_registry' as const,
              score: scored.score,
              tier: scored.tier,
              scoring_notes: scored.scoring_notes,
              has_wallet: false,
              has_mcp: true,
              has_a2a: false,
              has_image_gen: scored.has_image_gen,
              on_chain_txns: 0,
              outreach_status: 'pending' as const,
              contact_count: 0,
            });

          if (insertErr) {
            errors.push(`MCP server ${server.name}: ${insertErr.message}`);
          } else {
            newCandidates++;
          }
        }
      } catch (err) {
        errors.push(`MCP server ${server.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await completeDiscoveryRun(run.id, {
      agents_scanned: agentsScanned,
      new_candidates: newCandidates,
      updated_candidates: updatedCandidates,
      notes: errors.length > 0
        ? `${errors.length} errors: ${errors.slice(0, 5).join('; ')}`
        : `MCP Registry search: "${searchTerm}" (${servers.length} results)`,
    });

    await updateMarketingAgentStats(drHobbs.id, {
      total_candidates_found: drHobbs.total_candidates_found + newCandidates,
    });

    return { runId: run.id, source: 'mcp_registry', agentsScanned, newCandidates, updatedCandidates, errors };
  } catch (err) {
    await failDiscoveryRun(run.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. RNWY Trust Check — enriches existing candidates with reputation data
// ═══════════════════════════════════════════════════════════════════════════

interface RnwyTrustCheck {
  agent_id: number;
  chain: string;
  verdict: string;   // 'pass' | 'fail' | 'neutral'
  score: number;
  reasoning: string;
}

export async function enrichWithRnwyTrust(
  agentId: number,
  chain: string = 'base',
): Promise<RnwyTrustCheck | null> {
  try {
    const res = await fetch(
      `https://rnwy.com/api/trust-check?id=${agentId}&chain=${chain}`,
      { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = await res.json();

    // Update candidate with trust data
    await db
      .from('mkt_candidates')
      .update({
        erc8004_trust: data.verdict ?? null,
        scoring_notes: `RNWY trust: ${data.verdict} (${data.score})`,
        updated_at: new Date().toISOString(),
      })
      .eq('erc8004_id', agentId)
      .eq('chain', chain);

    return data;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. RNWY Search — find agents by specific criteria
// ═══════════════════════════════════════════════════════════════════════════

export async function searchRnwyAgents(
  chain: string = 'base',
  filters: {
    has_mcp?: boolean;
    has_a2a?: boolean;
    has_x402?: boolean;
    min_score?: number;
    limit?: number;
  } = {},
): Promise<RnwyAgent[]> {
  try {
    const params = new URLSearchParams({ chain, limit: String(filters.limit ?? 50) });
    // Build filter params if RNWY supports them
    const res = await fetch(
      `https://rnwy.com/api/agents?${params.toString()}`,
      { signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    let agents: RnwyAgent[] = data.agents ?? [];

    // Client-side filtering for fields RNWY exposes
    if (filters.has_mcp) agents = agents.filter(a => !!a.mcp_endpoint);
    if (filters.has_a2a) agents = agents.filter(a => !!a.a2a_endpoint);
    if (filters.has_x402) agents = agents.filter(a => a.x402_support === true);

    return agents;
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. ag0 SDK — Multi-chain agent search via agent0-sdk
//    npm: agent0-sdk (ESM-only, Node 22+)
//    Searches ERC-8004 agents across all chains with rich filtering
// ═══════════════════════════════════════════════════════════════════════════

interface Ag0AgentSummary {
  agentId: number;
  chainId: number;
  name?: string;
  description?: string;
  active?: boolean;
  mcpEndpoint?: string;
  mcpTools?: string[];
  a2aEndpoint?: string;
  a2aSkills?: string[];
  x402Support?: boolean;
  feedbackCount?: number;
  avgScore?: number;
  webEndpoint?: string;
  emailEndpoint?: string;
  image?: string;
  ens?: string;
  hasOASF?: boolean;
  oasfSkills?: string[];
}

function scoreAg0Agent(agent: Ag0AgentSummary): NormalisedCandidate {
  let score = 0;
  const parts: string[] = [];
  const allText = [
    agent.name ?? '',
    agent.description ?? '',
    ...(agent.mcpTools ?? []),
    ...(agent.a2aSkills ?? []),
  ].join(' ').toLowerCase();

  // Registered on-chain
  score += 15;
  parts.push('+15 registered');

  // Has name
  if (agent.name && agent.name.trim().length > 1) {
    score += 5;
    parts.push('+5 named');
  }

  // Has description
  if (agent.description && agent.description.length > 20) {
    score += 5;
    parts.push('+5 described');
  }

  // MCP support
  const hasMcp = !!(agent.mcpEndpoint || (agent.mcpTools && agent.mcpTools.length > 0));
  if (hasMcp) {
    score += 15;
    parts.push('+15 mcp');
  }

  // A2A support
  const hasA2a = !!(agent.a2aEndpoint || (agent.a2aSkills && agent.a2aSkills.length > 0));
  if (hasA2a) {
    score += 10;
    parts.push('+10 a2a');
  }

  // Creative capability
  const hasImageGen = detectCreative(allText);
  if (hasImageGen) {
    score += 15;
    parts.push('+15 creative');
  }

  // x402 support — commerce-ready
  if (agent.x402Support) {
    score += 10;
    parts.push('+10 x402');
  }

  // Has reputation (feedback)
  if (agent.feedbackCount && agent.feedbackCount > 0) {
    score += 5;
    parts.push(`+5 reputation(${agent.feedbackCount})`);
  }

  // Active
  if (agent.active) {
    score += 5;
    parts.push('+5 active');
  }

  // Has website or email (contactable)
  if (agent.webEndpoint || agent.emailEndpoint) {
    score += 5;
    parts.push('+5 contactable');
  }

  // Has ENS (identity signal)
  if (agent.ens) {
    score += 3;
    parts.push('+3 ens');
  }

  // Has OASF skills
  if (agent.hasOASF && agent.oasfSkills && agent.oasfSkills.length > 0) {
    score += 5;
    parts.push(`+5 oasf(${agent.oasfSkills.length})`);
  }

  const chainName = CHAIN_ID_TO_NAME[agent.chainId] ?? `chain_${agent.chainId}`;

  return {
    chain: chainName,
    erc8004_id: agent.agentId,
    wallet_address: null, // ag0 subgraph doesn't expose owner wallet
    name: agent.name ?? null,
    description: agent.description ?? null,
    platform: null,
    metadata_url: agent.webEndpoint ?? agent.mcpEndpoint ?? null,
    // Cap at warm (50) if no endpoints — unreachable agents can't be hot
    score: Math.min(score, hasMcp || hasA2a ? 100 : 50),
    tier: tierFromScore(Math.min(score, hasMcp || hasA2a ? 100 : 50)),
    scoring_notes: parts.join(', ') + (!hasMcp && !hasA2a ? ' [capped: no endpoint]' : ''),
    has_wallet: false,
    has_mcp: hasMcp,
    has_a2a: hasA2a,
    has_image_gen: hasImageGen,
  };
}

/**
 * Scan agents via ag0 SDK searchAgents().
 * Filters for creative/image capabilities by default.
 * Supports multi-chain or single-chain searches.
 */
export async function scanAg0(
  chain: string = 'all',
  limit: number = 100,
  filters?: {
    name?: string;
    active?: boolean;
    mcpTools?: string[];
    a2aSkills?: string[];
    x402support?: boolean;
    minFeedback?: number;
  },
): Promise<OracleResult> {
  const errors: string[] = [];
  const drHobbs = await getMarketingAgentByWallet(DRHOBBS_WALLET);
  if (!drHobbs) throw new Error('DrHobbs marketing agent not found');

  const run = await createDiscoveryRun(drHobbs.id, 'ag0_sdk', chain);
  if (!run) throw new Error('Failed to create discovery run');

  let agentsScanned = 0;
  let newCandidates = 0;
  let updatedCandidates = 0;

  try {
    // Query The Graph subgraph directly (avoids heavy agent0-sdk dependency)
    // API keys from env vars — fall back to hardcoded only if env not set
    const graphKeyBase = process.env.THEGRAPH_API_KEY_BASE ?? '536c6d8572876cabea4a4ad0fa49aa57';
    const graphKeyEth = process.env.THEGRAPH_API_KEY_ETH ?? '7fd2e7d89ce3ef24cd0d4590298f0b2c';
    const AG0_SUBGRAPH_URLS: Record<number, string> = {
      8453: `https://gateway.thegraph.com/api/${graphKeyBase}/subgraphs/id/43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb`,
      1: `https://gateway.thegraph.com/api/${graphKeyEth}/subgraphs/id/FV6RR6y13rsnCxBAicKuQEwDp8ioEGiNaWaZUmvr1F8k`,
    };

    // Determine which chains to query
    const chainEntries = chain === 'all'
      ? Object.entries(AG0_SUBGRAPH_URLS)
      : (() => {
          const chainId = Number(Object.entries(CHAIN_ID_TO_NAME).find(([, name]) => name === chain)?.[0] ?? 8453);
          const url = AG0_SUBGRAPH_URLS[chainId];
          return url ? [[String(chainId), url]] : [];
        })();

    // Build GraphQL query with filters
    const whereClause: string[] = [];
    if (filters?.name) whereClause.push(`name_contains_nocase: "${filters.name}"`);
    if (filters?.active !== undefined) whereClause.push(`active: ${filters.active}`);
    const whereStr = whereClause.length > 0 ? `, where: { ${whereClause.join(', ')} }` : '';

    const query = `{
      agentRegistrationFiles(first: ${limit}, orderBy: agentId, orderDirection: desc${whereStr}) {
        agentId
        name
        description
        active
        mcpEndpoint
        mcpTools { name }
        a2aEndpoint
        a2aSkills { name }
        x402Support
        webEndpoint
        emailEndpoint
        image
        ens
        hasOASF
        oasfSkills { name }
      }
    }`;

    const agents: Ag0AgentSummary[] = [];

    for (const [chainIdStr, subgraphUrl] of chainEntries) {
      try {
        const res = await fetch(subgraphUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          errors.push(`ag0 subgraph chain ${chainIdStr}: HTTP ${res.status}`);
          continue;
        }
        const data = await res.json();
        const files = data?.data?.agentRegistrationFiles ?? [];
        for (const f of files) {
          // agentId format is "chainId:tokenId" (e.g. "8453:9961")
          const agentIdStr = String(f.agentId ?? '');
          const colonIdx = agentIdStr.indexOf(':');
          const tokenId = colonIdx >= 0 ? Number(agentIdStr.slice(colonIdx + 1)) : Number(agentIdStr);
          if (isNaN(tokenId)) continue;

          // mcpTools and a2aSkills are arrays of {name} objects
          const mcpToolNames = Array.isArray(f.mcpTools)
            ? f.mcpTools.map((t: { name?: string }) => t.name ?? '').filter(Boolean)
            : [];
          const a2aSkillNames = Array.isArray(f.a2aSkills)
            ? f.a2aSkills.map((s: { name?: string }) => s.name ?? '').filter(Boolean)
            : [];
          const oasfSkillNames = Array.isArray(f.oasfSkills)
            ? f.oasfSkills.map((s: { name?: string }) => s.name ?? '').filter(Boolean)
            : [];

          agents.push({
            agentId: tokenId,
            chainId: Number(chainIdStr),
            name: f.name ?? undefined,
            description: f.description ?? undefined,
            active: f.active ?? undefined,
            mcpEndpoint: f.mcpEndpoint ?? undefined,
            mcpTools: mcpToolNames.length > 0 ? mcpToolNames : undefined,
            a2aEndpoint: f.a2aEndpoint ?? undefined,
            a2aSkills: a2aSkillNames.length > 0 ? a2aSkillNames : undefined,
            x402Support: f.x402Support ?? undefined,
            webEndpoint: f.webEndpoint ?? undefined,
            emailEndpoint: f.emailEndpoint ?? undefined,
            image: f.image ?? undefined,
            ens: f.ens ?? undefined,
            hasOASF: f.hasOASF ?? false,
            oasfSkills: oasfSkillNames.length > 0 ? oasfSkillNames : undefined,
          });
        }
      } catch (err) {
        errors.push(`ag0 subgraph chain ${chainIdStr}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const agent of agents) {
      // Skip our own agents on Base
      const chainName = CHAIN_ID_TO_NAME[agent.chainId] ?? `chain_${agent.chainId}`;
      if (SKIP_ERC8004_IDS[chainName]?.has(agent.agentId)) continue;

      try {
        agentsScanned++;
        const scored = scoreAg0Agent(agent);

        // Check if this (chain, erc8004_id) already exists
        const { data: existing } = await db
          .from('mkt_candidates')
          .select('id, score')
          .eq('erc8004_id', agent.agentId)
          .eq('chain', chainName)
          .single();

        if (existing) {
          await db
            .from('mkt_candidates')
            .update({
              name: scored.name ?? undefined,
              wallet_address: scored.wallet_address,
              metadata_url: scored.metadata_url ?? undefined,
              score: Math.max(existing.score, scored.score),
              tier: tierFromScore(Math.max(existing.score, scored.score)),
              scoring_notes: scored.scoring_notes,
              has_mcp: scored.has_mcp || undefined,
              has_a2a: scored.has_a2a || undefined,
              has_image_gen: scored.has_image_gen || undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          updatedCandidates++;
        } else {
          const { error: insertErr } = await db
            .from('mkt_candidates')
            .insert({
              chain: chainName,
              erc8004_id: agent.agentId,
              wallet_address: scored.wallet_address,
              name: scored.name,
              platform: scored.platform,
              metadata_url: scored.metadata_url,
              discovered_by: drHobbs.id,
              discovery_run: run.id,
              discovery_source: 'ag0_sdk' as const,
              score: scored.score,
              tier: scored.tier,
              scoring_notes: scored.scoring_notes,
              has_wallet: scored.has_wallet,
              has_mcp: scored.has_mcp,
              has_a2a: scored.has_a2a,
              has_image_gen: scored.has_image_gen,
              on_chain_txns: 0,
              outreach_status: 'pending' as const,
              contact_count: 0,
            });

          if (insertErr) {
            errors.push(`ag0 agent #${agent.agentId}: ${insertErr.message}`);
          } else {
            newCandidates++;
          }
        }
      } catch (err) {
        errors.push(`ag0 agent #${agent.agentId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await completeDiscoveryRun(run.id, {
      agents_scanned: agentsScanned,
      new_candidates: newCandidates,
      updated_candidates: updatedCandidates,
      notes: errors.length > 0
        ? `${errors.length} errors: ${errors.slice(0, 5).join('; ')}`
        : `ag0 SDK ${chain} (${agents.length} agents returned)`,
    });

    await updateMarketingAgentStats(drHobbs.id, {
      total_candidates_found: drHobbs.total_candidates_found + newCandidates,
    });

    return { runId: run.id, source: 'ag0_sdk', agentsScanned, newCandidates, updatedCandidates, errors };
  } catch (err) {
    await failDiscoveryRun(run.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. ClawPlaza / ERC-8183 (IACP) — On-chain bounty marketplace
//    Contract: 0x16213AB6a660A24f36d4F8DdACA7a3d0856A8AF5 (Base)
//    Scans open creative jobs to find active agent providers
// ═══════════════════════════════════════════════════════════════════════════

const IACP_CONTRACT = '0x16213AB6a660A24f36d4F8DdACA7a3d0856A8AF5';

const IACP_ABI = [
  'function jobCount() external view returns (uint256)',
  'function getJob(uint256 jobId) external view returns (tuple(address client, address provider, uint8 status, uint256 reward, string metadataURI))',
] as const;

// IACP job statuses: 0=Open, 1=Funded, 2=Submitted, 3=Completed, 4=Rejected
const JOB_STATUS_NAMES = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected'] as const;

interface IacpJob {
  jobId: number;
  client: string;
  provider: string;
  status: number;
  reward: bigint;
  metadataURI: string;
}

function scoreClawPlazaAgent(
  address: string,
  role: 'provider' | 'client',
  jobCount: number,
  completedJobs: number,
  totalRewardWei: bigint,
  hasCreativeJobs: boolean,
): NormalisedCandidate {
  let score = 0;
  const parts: string[] = [];

  // On-chain activity
  score += 15;
  parts.push('+15 on_chain');

  // Has completed jobs (proven track record)
  if (completedJobs > 0) {
    score += 15;
    parts.push(`+15 completed(${completedJobs})`);
  }

  // Active in bounty marketplace
  if (jobCount > 1) {
    score += 5;
    parts.push(`+5 active(${jobCount} jobs)`);
  }

  // Provider role preferred (they do the work)
  if (role === 'provider') {
    score += 10;
    parts.push('+10 provider');
  }

  // Creative jobs
  if (hasCreativeJobs) {
    score += 15;
    parts.push('+15 creative');
  }

  // Has earned rewards (commerce-ready)
  if (totalRewardWei > 0n) {
    score += 10;
    parts.push('+10 earned_rewards');
  }

  // Has wallet (always true for on-chain)
  score += 5;
  parts.push('+5 wallet');

  return {
    chain: 'base',
    erc8004_id: null,
    wallet_address: address.toLowerCase(),
    name: `ClawPlaza ${role} (${jobCount} jobs)`,
    description: `Active ${role} on ClawPlaza/IACP marketplace. ${completedJobs} completed, ${jobCount} total jobs.`,
    platform: 'clawplaza',
    metadata_url: null,
    // ClawPlaza agents never have MCP/A2A — cap at warm (50)
    score: Math.min(score, 50),
    tier: tierFromScore(Math.min(score, 50)),
    scoring_notes: parts.join(', ') + ' [capped: no endpoint]',
    has_wallet: true,
    has_mcp: false,
    has_a2a: false,
    has_image_gen: hasCreativeJobs,
  };
}

/**
 * Scan ERC-8183 IACP contract on Base for active creative agents.
 * Finds providers and clients who participate in bounty jobs,
 * especially those with creative/design-related metadata.
 */
export async function scanClawPlaza(
  maxJobs: number = 200,
  startFromEnd: boolean = true,
): Promise<OracleResult> {
  const errors: string[] = [];
  const drHobbs = await getMarketingAgentByWallet(DRHOBBS_WALLET);
  if (!drHobbs) throw new Error('DrHobbs marketing agent not found');

  const run = await createDiscoveryRun(drHobbs.id, 'clawplaza', 'base');
  if (!run) throw new Error('Failed to create discovery run');

  let agentsScanned = 0;
  let newCandidates = 0;
  let updatedCandidates = 0;

  try {
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    const contract = new ethers.Contract(IACP_CONTRACT, IACP_ABI, provider);

    // Get total job count (with timeout — RPC can hang indefinitely)
    const totalJobs = Number(await withTimeout(
      contract.jobCount() as Promise<bigint>,
      RPC_TIMEOUT_MS,
      'IACP jobCount()',
    ));
    if (totalJobs === 0) {
      await completeDiscoveryRun(run.id, {
        agents_scanned: 0,
        new_candidates: 0,
        updated_candidates: 0,
        notes: 'IACP contract has 0 jobs',
      });
      return { runId: run.id, source: 'clawplaza', agentsScanned: 0, newCandidates: 0, updatedCandidates: 0, errors };
    }

    // Determine scan range (scan most recent jobs first)
    const scanCount = Math.min(maxJobs, totalJobs);
    const startId = startFromEnd ? Math.max(0, totalJobs - scanCount) : 0;
    const endId = startFromEnd ? totalJobs : Math.min(scanCount, totalJobs);

    // Collect agent activity across jobs
    const agentActivity: Map<string, {
      role: 'provider' | 'client';
      jobCount: number;
      completedJobs: number;
      totalRewardWei: bigint;
      hasCreativeJobs: boolean;
    }> = new Map();

    for (let jobId = startId; jobId < endId; jobId++) {
      try {
        const job = await withTimeout(
          contract.getJob(BigInt(jobId)) as Promise<[string, string, bigint, bigint, string]>,
          RPC_TIMEOUT_MS,
          `IACP getJob(${jobId})`,
        );
        const client: string = job[0];
        const jobProvider: string = job[1];
        const status: number = Number(job[2]);
        const reward: bigint = BigInt(job[3]);
        const metadataURI: string = job[4] ?? '';

        // Check if job is creative-related
        const metaText = metadataURI.toLowerCase();
        const isCreative = detectCreative(metaText) ||
          /art|design|image|creative|nft|fashion|visual|illustrat/i.test(metaText);

        // Track provider activity
        if (jobProvider && jobProvider !== ethers.ZeroAddress) {
          const key = jobProvider.toLowerCase();
          const existing = agentActivity.get(key);
          if (existing) {
            existing.jobCount++;
            if (status === 3) existing.completedJobs++;
            existing.totalRewardWei += reward;
            if (isCreative) existing.hasCreativeJobs = true;
          } else {
            agentActivity.set(key, {
              role: 'provider',
              jobCount: 1,
              completedJobs: status === 3 ? 1 : 0,
              totalRewardWei: reward,
              hasCreativeJobs: isCreative,
            });
          }
        }

        // Track client activity (they post bounties — potential brand partners)
        if (client && client !== ethers.ZeroAddress) {
          const key = client.toLowerCase();
          const existing = agentActivity.get(key);
          if (existing) {
            // Don't overwrite provider role with client role
            if (existing.role !== 'provider') {
              existing.jobCount++;
              if (status === 3) existing.completedJobs++;
              existing.totalRewardWei += reward;
              if (isCreative) existing.hasCreativeJobs = true;
            }
          } else {
            agentActivity.set(key, {
              role: 'client',
              jobCount: 1,
              completedJobs: status === 3 ? 1 : 0,
              totalRewardWei: reward,
              hasCreativeJobs: isCreative,
            });
          }
        }
      } catch (err) {
        errors.push(`IACP job #${jobId}: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Rate limit: pause every 20 jobs
      if (jobId > 0 && jobId % 20 === 0) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Skip our own wallet
    agentActivity.delete(DRHOBBS_WALLET.toLowerCase());

    // Insert/update candidates from aggregated activity
    for (const [address, activity] of agentActivity) {
      try {
        agentsScanned++;
        const scored = scoreClawPlazaAgent(
          address,
          activity.role,
          activity.jobCount,
          activity.completedJobs,
          activity.totalRewardWei,
          activity.hasCreativeJobs,
        );

        // Check if wallet already exists in candidates
        const { data: existing } = await db
          .from('mkt_candidates')
          .select('id, score')
          .eq('wallet_address', address)
          .single();

        if (existing) {
          // Enrich existing candidate with ClawPlaza data
          await db
            .from('mkt_candidates')
            .update({
              platform: scored.platform ?? undefined,
              score: Math.max(existing.score, scored.score),
              tier: tierFromScore(Math.max(existing.score, scored.score)),
              scoring_notes: scored.scoring_notes,
              has_image_gen: scored.has_image_gen || undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          updatedCandidates++;
        } else {
          const { error: insertErr } = await db
            .from('mkt_candidates')
            .insert({
              chain: 'base',
              erc8004_id: null,
              wallet_address: scored.wallet_address,
              name: scored.name,
              platform: 'clawplaza',
              metadata_url: null,
              discovered_by: drHobbs.id,
              discovery_run: run.id,
              discovery_source: 'clawplaza' as const,
              score: scored.score,
              tier: scored.tier,
              scoring_notes: scored.scoring_notes,
              has_wallet: true,
              has_mcp: false,
              has_a2a: false,
              has_image_gen: scored.has_image_gen,
              on_chain_txns: activity.jobCount,
              outreach_status: 'pending' as const,
              contact_count: 0,
            });

          if (insertErr) {
            errors.push(`ClawPlaza ${address}: ${insertErr.message}`);
          } else {
            newCandidates++;
          }
        }
      } catch (err) {
        errors.push(`ClawPlaza ${address}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await completeDiscoveryRun(run.id, {
      agents_scanned: agentsScanned,
      new_candidates: newCandidates,
      updated_candidates: updatedCandidates,
      notes: errors.length > 0
        ? `${errors.length} errors: ${errors.slice(0, 5).join('; ')}`
        : `ClawPlaza IACP: ${totalJobs} total jobs, scanned ${scanCount}, found ${agentActivity.size} unique agents`,
    });

    await updateMarketingAgentStats(drHobbs.id, {
      total_candidates_found: drHobbs.total_candidates_found + newCandidates,
    });

    return { runId: run.id, source: 'clawplaza', agentsScanned, newCandidates, updatedCandidates, errors };
  } catch (err) {
    await failDiscoveryRun(run.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. 8004scan.io — ERC-8004 Identity Registry index
//    https://8004scan.io/api/v1/agents — 110K+ registered agents
//    All agents here are guaranteed ERC-8004 registered (+20 baseline)
// ═══════════════════════════════════════════════════════════════════════════

// Actual 8004scan.io API response schema
interface Agent8004 {
  id: string;                        // UUID
  agent_id: string;                  // e.g. "8453:0x8004...:34656"
  token_id: string;                  // numeric token id as string, e.g. "34656"
  chain_id: number;
  is_testnet: boolean;
  owner_address: string;
  name: string | null;
  description: string | null;
  health_score: number | null;       // 0–100
  is_verified: boolean;
  supported_protocols: string[];     // ["MCP", "A2A", "OASF", "x402", ...]
  x402_supported: boolean;
  total_score: number;
}

interface Agent8004Response {
  items: Agent8004[];
  total: number;
  limit: number;
  offset: number;
}

// Map 8004scan chain_id to our chain names (same mapping as RNWY)
const CHAIN_8004_TO_NAME: Record<number, string> = {
  8453: 'base',
  1: 'ethereum',
  56: 'bnb',
  100: 'gnosis',
  42220: 'celo',
  42161: 'arbitrum',
  10: 'optimism',
  137: 'polygon',
  43114: 'avalanche',
  59144: 'linea',
  534352: 'scroll',
};

function score8004Agent(agent: Agent8004): NormalisedCandidate {
  let score = 0;
  const parts: string[] = [];
  const protocols = agent.supported_protocols ?? [];
  const allText = [agent.name ?? '', agent.description ?? ''].join(' ').toLowerCase();
  const tokenId = parseInt(agent.token_id, 10);

  // ERC-8004 registered — guaranteed baseline (+20, better than +15 for chain_scan)
  score += 20;
  parts.push('+20 erc8004_registered');

  // Has name
  if (agent.name && agent.name.trim().length > 1) {
    score += 5;
    parts.push('+5 named');
  }

  // Has description
  if (agent.description && agent.description.length > 20) {
    score += 5;
    parts.push('+5 described');
  }

  // Health score from 8004scan (0–100)
  if (agent.health_score != null) {
    if (agent.health_score >= 80) {
      score += 15;
      parts.push(`+15 health(${agent.health_score})`);
    } else if (agent.health_score >= 50) {
      score += 8;
      parts.push(`+8 health(${agent.health_score})`);
    } else if (agent.health_score >= 20) {
      score += 3;
      parts.push(`+3 health(${agent.health_score})`);
    }
  }

  // Protocol capabilities (array of strings: "MCP", "A2A", "OASF", ...)
  const hasMcp = protocols.includes('MCP');
  const hasA2a = protocols.includes('A2A');
  if (hasMcp) { score += 15; parts.push('+15 mcp'); }
  if (hasA2a) { score += 10; parts.push('+10 a2a'); }
  if (agent.x402_supported) { score += 8; parts.push('+8 x402'); }
  if (agent.is_verified) { score += 5; parts.push('+5 verified'); }

  // Creative capability from name/description
  const hasImageGen = detectCreative(allText);
  if (hasImageGen) {
    score += 10;
    parts.push('+10 creative');
  }

  const chainName = CHAIN_8004_TO_NAME[agent.chain_id] ?? `chain_${agent.chain_id}`;

  return {
    chain: chainName,
    erc8004_id: isNaN(tokenId) ? null : tokenId,
    wallet_address: agent.owner_address ?? null,
    name: agent.name ?? null,
    description: agent.description ? agent.description.slice(0, 2000) : null,
    platform: '8004scan',
    metadata_url: `https://8004scan.io/agents/${agent.agent_id}`,
    // Cap at warm (50) if no endpoints — unreachable agents can't be hot
    score: Math.min(score, hasMcp || hasA2a ? 100 : 50),
    tier: tierFromScore(Math.min(score, hasMcp || hasA2a ? 100 : 50)),
    scoring_notes: parts.join(', ') + (!hasMcp && !hasA2a ? ' [capped: no endpoint]' : ''),
    has_wallet: !!agent.owner_address,
    has_mcp: hasMcp,
    has_a2a: hasA2a,
    has_image_gen: hasImageGen,
  };
}

/**
 * Scan ERC-8004 registered agents via 8004scan.io API.
 * All returned agents are guaranteed ERC-8004 registered.
 */
export async function run8004ScanOracle(
  limit: number = 100,           // 8004scan API max is 100
  offset: number = 0,
  minScore: number = 20,
): Promise<OracleResult> {
  const errors: string[] = [];
  // Use RRG platform agent as the scanner; fall back to DrHobbs if not yet in DB
  const scanner = await getMarketingAgentByWallet(RRG_PLATFORM_WALLET)
    ?? await getMarketingAgentByWallet(DRHOBBS_WALLET);
  if (!scanner) throw new Error('No marketing agent found for 8004scan oracle');

  const run = await createDiscoveryRun(scanner.id, '8004scan_oracle', 'multi-chain');
  if (!run) throw new Error('Failed to create discovery run');

  let agentsScanned = 0;
  let newCandidates = 0;
  let updatedCandidates = 0;

  try {
    // API uses offset-based pagination (not page-based)
    const url = `https://8004scan.io/api/v1/agents?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; RRG-Scanner/1.0)',
      },
    });

    if (!res.ok) {
      throw new Error(`8004scan API returned ${res.status}: ${res.statusText}`);
    }

    const data: Agent8004Response = await res.json();
    const agents: Agent8004[] = data.items ?? [];

    for (const agent of agents) {
      // Skip testnet agents
      if (agent.is_testnet) continue;

      // Skip our own agents
      const tokenId = parseInt(agent.token_id, 10);
      const chainName = CHAIN_8004_TO_NAME[agent.chain_id] ?? `chain_${agent.chain_id}`;
      if (SKIP_ERC8004_IDS['base']?.has(tokenId) && chainName === 'base') continue;

      try {
        agentsScanned++;
        const scored = score8004Agent(agent);

        // Skip below minimum score or unparseable token_id
        if (scored.score < minScore || scored.erc8004_id == null) continue;

        // Check if this (chain, erc8004_id) already exists
        const { data: existing } = await db
          .from('mkt_candidates')
          .select('id, score')
          .eq('erc8004_id', scored.erc8004_id)
          .eq('chain', chainName)
          .single();

        if (existing) {
          // Update — 8004scan data always enriches (adds erc8004_id, health_score, capabilities)
          await db
            .from('mkt_candidates')
            .update({
              name: scored.name ?? undefined,
              wallet_address: scored.wallet_address ?? undefined,
              description: scored.description ?? undefined,
              platform: scored.platform ?? undefined,
              metadata_url: scored.metadata_url ?? undefined,
              score: Math.max(existing.score, scored.score),
              tier: tierFromScore(Math.max(existing.score, scored.score)),
              scoring_notes: scored.scoring_notes,
              has_mcp: scored.has_mcp || undefined,
              has_a2a: scored.has_a2a || undefined,
              has_image_gen: scored.has_image_gen || undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          updatedCandidates++;
        } else {
          const { error: insertErr } = await db
            .from('mkt_candidates')
            .insert({
              chain: chainName,
              erc8004_id: scored.erc8004_id,
              wallet_address: scored.wallet_address,
              name: scored.name,
              description: scored.description,
              platform: scored.platform,
              metadata_url: scored.metadata_url,
              discovered_by: scanner.id,
              discovery_run: run.id,
              discovery_source: '8004scan' as const,
              score: scored.score,
              tier: scored.tier,
              scoring_notes: scored.scoring_notes,
              has_wallet: scored.has_wallet,
              has_mcp: scored.has_mcp,
              has_a2a: scored.has_a2a,
              has_image_gen: scored.has_image_gen,
              on_chain_txns: 0,
              outreach_status: 'pending' as const,
              contact_count: 0,
            });

          if (insertErr) {
            errors.push(`8004scan #${scored.erc8004_id}: ${insertErr.message}`);
          } else {
            newCandidates++;
          }
        }
      } catch (err) {
        errors.push(`8004scan item: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await completeDiscoveryRun(run.id, {
      agents_scanned: agentsScanned,
      new_candidates: newCandidates,
      updated_candidates: updatedCandidates,
      notes: errors.length > 0
        ? `${errors.length} errors: ${errors.slice(0, 5).join('; ')}`
        : `8004scan offset ${offset} (${agents.length} agents, total: ${data.total ?? '?'})`,
    });

    await updateMarketingAgentStats(scanner.id, {
      total_candidates_found: scanner.total_candidates_found + newCandidates,
    });

    return { runId: run.id, source: '8004scan', agentsScanned, newCandidates, updatedCandidates, errors };
  } catch (err) {
    await failDiscoveryRun(run.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Supported oracles — used by admin UI and API route
// ═══════════════════════════════════════════════════════════════════════════

export interface OracleConfig {
  id: string;
  name: string;
  description: string;
  source: DiscoverySource;
  supportsChain: boolean;     // whether chain param is relevant
  defaultChain: string;
  rateLimit: string;
}

export const ORACLE_CONFIGS: OracleConfig[] = [
  {
    id: '8004scan',
    name: '8004scan.io',
    description: 'ERC-8004 Identity Registry index — 110K+ verified agents with health scores + capabilities',
    source: '8004scan',
    supportsChain: false,
    defaultChain: 'multi-chain',
    rateLimit: 'generous',
  },
  {
    id: 'rnwy',
    name: 'RNWY Explorer',
    description: '124K+ agents with reputation, MCP/A2A endpoints, trust scores',
    source: 'rnwy',
    supportsChain: true,
    defaultChain: 'base',
    rateLimit: '60/hr',
  },
  {
    id: 'mcp_registry',
    name: 'MCP Registry',
    description: 'Official MCP server catalogue — creative/art tool servers',
    source: 'mcp_registry',
    supportsChain: false,
    defaultChain: 'offchain',
    rateLimit: 'generous',
  },
  {
    id: 'ag0_sdk',
    name: 'ag0 SDK',
    description: 'Multi-chain agent search with filters (MCP tools, A2A skills, x402, feedback)',
    source: 'ag0_sdk',
    supportsChain: true,
    defaultChain: 'all',
    rateLimit: 'generous',
  },
  {
    id: 'clawplaza',
    name: 'ClawPlaza / IACP',
    description: 'ERC-8183 bounty marketplace — scans on-chain jobs for active creative providers',
    source: 'clawplaza',
    supportsChain: false,
    defaultChain: 'base',
    rateLimit: 'RPC-limited',
  },
];
