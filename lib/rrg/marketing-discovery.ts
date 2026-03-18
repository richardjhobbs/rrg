/**
 * Agent Marketing System — Discovery Engine (Multi-Chain)
 *
 * Scans the ERC-8004 Identity Registry across multiple chains to find registered agents.
 * For each agent, fetches metadata, scores capability signals,
 * assigns a tier, and inserts into mkt_candidates.
 *
 * The same contract address is deployed on all chains.
 * Scoring is generous — any registered agent with metadata is worth reaching out to.
 * The registry is sparse (IDs are not sequential), so we scan large ranges.
 */

import { ethers } from 'ethers';
import { db } from './db';
import {
  type CandidateTier,
  getCandidateByErc8004Id,
  createDiscoveryRun,
  completeDiscoveryRun,
  failDiscoveryRun,
  updateMarketingAgentStats,
  getMarketingAgentByWallet,
} from './marketing-db';
import { TIER_HOT_THRESHOLD, TIER_WARM_THRESHOLD } from './marketing-oracles';

// ── Chain Configuration ─────────────────────────────────────────────────────

export type SupportedChain =
  | 'base' | 'ethereum' | 'bnb' | 'monad' | 'megaeth'
  | 'gnosis' | 'celo' | 'arbitrum' | 'optimism'
  | 'polygon' | 'avalanche' | 'linea' | 'scroll' | 'abstract';

export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  agentCount: number; // approximate, for UI display
}

export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  base:      { name: 'Base',       chainId: 8453,   rpcUrl: 'https://mainnet.base.org',            agentCount: 18123 },
  ethereum:  { name: 'Ethereum',   chainId: 1,      rpcUrl: 'https://eth.llamarpc.com',            agentCount: 14319 },
  bnb:       { name: 'BNB Chain',  chainId: 56,     rpcUrl: 'https://bsc-dataseed.binance.org/',   agentCount: 36681 },
  monad:     { name: 'Monad',      chainId: 143,    rpcUrl: 'https://monad-mainnet.g.alchemy.com/v2/demo', agentCount: 8338 },
  megaeth:   { name: 'MegaETH',    chainId: 4326,   rpcUrl: 'https://rpc.megaeth.com',             agentCount: 8130  },
  gnosis:    { name: 'Gnosis',     chainId: 100,    rpcUrl: 'https://rpc.gnosischain.com',         agentCount: 3189  },
  celo:      { name: 'Celo',       chainId: 42220,  rpcUrl: 'https://forno.celo.org',              agentCount: 1851  },
  arbitrum:  { name: 'Arbitrum',   chainId: 42161,  rpcUrl: 'https://arb1.arbitrum.io/rpc',        agentCount: 656   },
  optimism:  { name: 'Optimism',   chainId: 10,     rpcUrl: 'https://mainnet.optimism.io',         agentCount: 437   },
  polygon:   { name: 'Polygon',    chainId: 137,    rpcUrl: 'https://polygon-rpc.com',             agentCount: 228   },
  avalanche: { name: 'Avalanche',  chainId: 43114,  rpcUrl: 'https://api.avax.network/ext/bc/C/rpc', agentCount: 143 },
  linea:     { name: 'Linea',      chainId: 59144,  rpcUrl: 'https://rpc.linea.build',             agentCount: 109   },
  scroll:    { name: 'Scroll',     chainId: 534352, rpcUrl: 'https://rpc.scroll.io',               agentCount: 104   },
  abstract:  { name: 'Abstract',   chainId: 2741,   rpcUrl: 'https://api.mainnet.abs.xyz',         agentCount: 50    },
};

// ── Constants ──────────────────────────────────────────────────────────────

const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const DRHOBBS_WALLET = '0xe653804032A2d51Cc031795afC601B9b1fd2c375';

// Our own agents — skip these (Base only, but safe to skip globally)
const SKIP_AGENT_IDS = new Set([17666, 26244]);

const REGISTRY_ABI = [
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
] as const;

const RPC_TIMEOUT_MS = 15_000;

/** Wrap a promise with a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout (${ms}ms): ${label}`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ── Provider ───────────────────────────────────────────────────────────────

function getProvider(chain: SupportedChain = 'base'): ethers.JsonRpcProvider {
  const config = CHAIN_CONFIGS[chain];
  return new ethers.JsonRpcProvider(config.rpcUrl);
}

function getRegistryContract(provider: ethers.JsonRpcProvider): ethers.Contract {
  return new ethers.Contract(IDENTITY_REGISTRY, REGISTRY_ABI, provider);
}

// ── Metadata fetcher ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentMetadata = Record<string, any>;

async function fetchAgentMetadata(uri: string): Promise<AgentMetadata | null> {
  try {
    // data: URIs (base64 encoded JSON)
    if (uri.startsWith('data:')) {
      const match = uri.match(/^data:[^;]*;base64,(.+)$/);
      if (match) {
        return JSON.parse(Buffer.from(match[1], 'base64').toString('utf-8'));
      }
      return null;
    }

    // IPFS URIs
    let url = uri;
    if (uri.startsWith('ipfs://')) {
      url = `https://ipfs.io/ipfs/${uri.slice(7)}`;
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Deep metadata text extraction ──────────────────────────────────────────

/** Flatten an entire metadata object into a single searchable string. */
function flattenMetadata(obj: unknown, depth = 0): string {
  if (depth > 5) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) return obj.map((v) => flattenMetadata(v, depth + 1)).join(' ');
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>)
      .map(([k, v]) => `${k} ${flattenMetadata(v, depth + 1)}`)
      .join(' ');
  }
  return '';
}

/** Extract all URLs/endpoints from a metadata object. */
function extractEndpoints(obj: unknown, depth = 0): string[] {
  if (depth > 5) return [];
  const urls: string[] = [];
  if (typeof obj === 'string' && (obj.startsWith('http') || obj.startsWith('wss'))) {
    urls.push(obj);
  }
  if (Array.isArray(obj)) {
    for (const v of obj) urls.push(...extractEndpoints(v, depth + 1));
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      urls.push(...extractEndpoints(v, depth + 1));
    }
  }
  return urls;
}

// ── Scoring (generous) ────────────────────────────────────────────────────

interface ScoringResult {
  score: number;
  tier: CandidateTier;
  notes: string;
  signals: {
    has_wallet: boolean;
    has_mcp: boolean;
    has_a2a: boolean;
    has_image_gen: boolean;
    platform: string | null;
  };
}

function scoreCandidate(
  ownerAddress: string,
  metadata: AgentMetadata | null,
): ScoringResult {
  let score = 0;
  const parts: string[] = [];

  // Registered on-chain = active agent
  if (ownerAddress) {
    score += 15;
    parts.push('+15 registered');
  }

  if (!metadata) {
    return {
      score: Math.min(score, 100),
      tier: 'cold',
      notes: parts.join(', ') || 'no metadata',
      signals: { has_wallet: true, has_mcp: false, has_a2a: false, has_image_gen: false, platform: null },
    };
  }

  // Has any metadata at all — shows effort
  score += 10;
  parts.push('+10 metadata');

  // Flatten everything for keyword search
  const allText = flattenMetadata(metadata).toLowerCase();
  const endpoints = extractEndpoints(metadata);

  // Has a name
  if (metadata.name && metadata.name.trim().length > 1) {
    score += 5;
    parts.push('+5 named');
  }

  // Has a description
  if (metadata.description && metadata.description.length > 20) {
    score += 5;
    parts.push('+5 described');
  }

  // Has any reachable endpoint
  if (endpoints.length > 0) {
    score += 10;
    parts.push(`+10 endpoints(${endpoints.length})`);
  }

  // MCP support — broad check
  const hasMcp = !!(
    allText.includes('mcp') ||
    allText.includes('model context protocol') ||
    allText.includes('modelcontextprotocol')
  );
  if (hasMcp) {
    score += 15;
    parts.push('+15 mcp');
  }

  // A2A / agent-to-agent support
  const hasA2a = !!(
    allText.includes('a2a') ||
    allText.includes('agent-to-agent') ||
    allText.includes('agent_to_agent') ||
    allText.includes('agentprotocol')
  );
  if (hasA2a) {
    score += 10;
    parts.push('+10 a2a');
  }

  // Image / creative capability — very broad
  const hasImageGen = /image|art|design|generat|dall|stable|midjourney|creative|visual|nft|fashion|style|draw|paint|illustrat/i.test(allText);
  if (hasImageGen) {
    score += 15;
    parts.push('+15 creative');
  }

  // Commerce / payment / crypto signals
  if (/commerce|payment|usdc|usd|trade|buy|sell|purchase|swap|defi|x402/i.test(allText)) {
    score += 5;
    parts.push('+5 commerce');
  }

  // Has skills or capabilities listed (any format)
  if (metadata.skills || metadata.capabilities || metadata.services ||
      metadata.domains || metadata.tools || metadata.functions) {
    score += 5;
    parts.push('+5 skilled');
  }

  // Active flag
  if (metadata.active === true) {
    score += 5;
    parts.push('+5 active');
  }

  // Detect platform from metadata
  let platform: string | null = null;
  if (allText.includes('virtuals')) platform = 'virtuals';
  else if (allText.includes('eliza')) platform = 'eliza';
  else if (allText.includes('olas')) platform = 'olas';
  else if (allText.includes('autonolas')) platform = 'olas';
  else if (allText.includes('openclaw')) platform = 'openclaw';
  else if (allText.includes('oasf')) platform = 'oasf';

  // Determine tier — generous thresholds (shared constants from marketing-oracles)
  let tier: CandidateTier = 'cold';
  if (score >= TIER_HOT_THRESHOLD) tier = 'hot';
  else if (score >= TIER_WARM_THRESHOLD) tier = 'warm';

  return {
    score: Math.min(score, 100),
    tier,
    notes: parts.join(', '),
    signals: {
      has_wallet: true,
      has_mcp: hasMcp,
      has_a2a: hasA2a,
      has_image_gen: hasImageGen,
      platform,
    },
  };
}

// ── Main Scanner ───────────────────────────────────────────────────────────

export interface DiscoveryResult {
  runId: string;
  chain: string;
  agentsScanned: number;
  newCandidates: number;
  updatedCandidates: number;
  errors: string[];
}

/**
 * Scan the ERC-8004 Identity Registry on a specific chain for registered agents.
 * The registry is sparse — IDs are not sequential.
 * We scan a range and skip non-existent tokens.
 */
export async function runDiscoveryScan(
  chain: SupportedChain = 'base',
  startId = 1,
  maxScan = 500,
): Promise<DiscoveryResult> {
  const errors: string[] = [];

  const drHobbs = await getMarketingAgentByWallet(DRHOBBS_WALLET);
  if (!drHobbs) throw new Error('DrHobbs marketing agent not found in mkt_agents');

  const run = await createDiscoveryRun(drHobbs.id, 'erc8004_registry', chain);
  if (!run) throw new Error('Failed to create discovery run');

  let agentsScanned = 0;
  let newCandidates = 0;
  let updatedCandidates = 0;

  try {
    const provider = getProvider(chain);
    const contract = getRegistryContract(provider);

    const endId = startId + maxScan;

    for (let agentId = startId; agentId < endId; agentId++) {
      // Only skip our agents on Base
      if (chain === 'base' && SKIP_AGENT_IDS.has(agentId)) continue;

      try {
        // Check if token exists
        let owner: string;
        try {
          owner = await withTimeout(
            contract.ownerOf(BigInt(agentId)) as Promise<string>,
            RPC_TIMEOUT_MS,
            `ownerOf(${agentId})`,
          );
        } catch {
          continue; // Token doesn't exist or RPC timeout
        }

        agentsScanned++;

        // Read tokenURI
        let uri = '';
        try {
          uri = await withTimeout(
            contract.tokenURI(BigInt(agentId)) as Promise<string>,
            RPC_TIMEOUT_MS,
            `tokenURI(${agentId})`,
          );
        } catch {
          // No URI set or RPC timeout
        }

        // Fetch metadata
        let metadata: AgentMetadata | null = null;
        if (uri) {
          metadata = await fetchAgentMetadata(uri);
        }

        // Score
        const scoring = scoreCandidate(owner, metadata);

        // Check if this (chain, erc8004_id) already exists
        const existing = await getCandidateByErc8004Id(agentId, chain);

        if (existing) {
          // Update existing record
          await db
            .from('mkt_candidates')
            .update({
              wallet_address: owner.toLowerCase(),
              name: metadata?.name ?? existing.name,
              platform: scoring.signals.platform ?? existing.platform,
              metadata_url: uri || existing.metadata_url,
              score: scoring.score,
              tier: scoring.tier,
              scoring_notes: scoring.notes,
              has_wallet: scoring.signals.has_wallet,
              has_mcp: scoring.signals.has_mcp,
              has_a2a: scoring.signals.has_a2a,
              has_image_gen: scoring.signals.has_image_gen,
              updated_at: new Date().toISOString(),
            })
            .eq('erc8004_id', agentId)
            .eq('chain', chain);
          updatedCandidates++;
        } else {
          // Insert new candidate — keyed on (chain, erc8004_id)
          const { error: insertErr } = await db
            .from('mkt_candidates')
            .insert({
              chain,
              erc8004_id: agentId,
              wallet_address: owner.toLowerCase(),
              name: metadata?.name ?? null,
              platform: scoring.signals.platform,
              metadata_url: uri || null,
              discovered_by: drHobbs.id,
              discovery_run: run.id,
              discovery_source: 'chain_scan' as const,
              score: scoring.score,
              tier: scoring.tier,
              scoring_notes: scoring.notes,
              has_wallet: scoring.signals.has_wallet,
              has_mcp: scoring.signals.has_mcp,
              has_a2a: scoring.signals.has_a2a,
              has_image_gen: scoring.signals.has_image_gen,
              on_chain_txns: 0,
              outreach_status: 'pending' as const,
              contact_count: 0,
            });

          if (insertErr) {
            errors.push(`Agent #${agentId}: insert failed — ${insertErr.message}`);
          } else {
            newCandidates++;
          }
        }
      } catch (err) {
        errors.push(`Agent #${agentId}: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Rate limit: pause every 10 agents
      if (agentsScanned > 0 && agentsScanned % 10 === 0) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    await completeDiscoveryRun(run.id, {
      agents_scanned: agentsScanned,
      new_candidates: newCandidates,
      updated_candidates: updatedCandidates,
      notes: errors.length > 0 ? `${errors.length} errors: ${errors.slice(0, 5).join('; ')}` : undefined,
    });

    await updateMarketingAgentStats(drHobbs.id, {
      total_candidates_found: drHobbs.total_candidates_found + newCandidates,
    });

    return { runId: run.id, chain, agentsScanned, newCandidates, updatedCandidates, errors };
  } catch (err) {
    await failDiscoveryRun(run.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// ── Last scanned ID helper ─────────────────────────────────────────────────

export async function getLastScannedId(chain: SupportedChain = 'base'): Promise<number> {
  const { data } = await db
    .from('mkt_candidates')
    .select('erc8004_id')
    .eq('chain', chain)
    .not('erc8004_id', 'is', null)
    .order('erc8004_id', { ascending: false })
    .limit(1);

  if (data && data.length > 0 && data[0].erc8004_id != null) {
    return data[0].erc8004_id;
  }
  return 0;
}
