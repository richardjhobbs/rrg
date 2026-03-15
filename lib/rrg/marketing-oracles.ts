/**
 * Agent Marketing System — External Oracle Integrations
 *
 * Discovers candidate agents from sources beyond ERC-8004 chain scanning:
 *   - RNWY Explorer   (124K+ agents, rich reputation data, public API)
 *   - MCP Registry     (official MCP server catalogue, public API)
 *   - Olas Registry    (on-chain autonomous services)
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
  if (score >= 55) return 'hot';
  if (score >= 30) return 'warm';
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
    score: Math.min(score, 100),
    tier: tierFromScore(score),
    scoring_notes: parts.join(', '),
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
];
