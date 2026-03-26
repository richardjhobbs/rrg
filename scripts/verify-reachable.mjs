/**
 * Verify which ERC-8004 agents have real, reachable endpoints.
 *
 * THREE-PHASE PIPELINE (based on 8004scan API research 2026-03-21):
 *
 *   Phase 1 — DISCOVERY: Paginate 8004scan list API to get all agent IDs.
 *             Filter: total_score > 0 OR name is set (skip empty shells).
 *
 *   Phase 2 — ENRICHMENT: For each candidate, fetch the 8004scan DETAIL API
 *             to get raw_metadata.offchain_content. Parse services array ourselves
 *             (don't rely on supported_protocols which misses most agents).
 *             Check: services[].name exact match, substring match, type field,
 *             top-level endpoints/mcp_server/a2a_endpoint fields.
 *
 *   Phase 3 — LIVENESS: Health-check discovered endpoints directly.
 *             MCP: POST initialize request. A2A: GET and check for agent card JSON.
 *
 * WHY: 8004scan only populates supported_protocols when services[].name is an
 * exact keyword ("MCP", "A2A"). It ignores the type field entirely. This means
 * agents like DrHobbs (name: "DrHobbs MCP Server") get supported_protocols: [].
 * Our old script filtered on supported_protocols, dropping most real agents.
 *
 * Usage:
 *   node scripts/verify-reachable.mjs [--chain=base] [--dry-run]
 *
 * Options:
 *   --chain=X     Chain to check (default: base). Use 'all' for all chains.
 *   --dry-run     Don't update DB
 */
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const DRY_RUN = process.argv.includes('--dry-run');
const CHAIN_ARG = (process.argv.find(a => a.startsWith('--chain=')) || '--chain=base').split('=')[1];

const CHAIN_IDS = {
  base: 8453, ethereum: 1, celo: 42220, avalanche: 43114,
  arbitrum: 42161, optimism: 10, polygon: 137, gnosis: 100, bnb: 56,
};

// Reverse lookup: chainId -> chain name
const CHAIN_NAMES = Object.fromEntries(Object.entries(CHAIN_IDS).map(([k, v]) => [v, k]));

// ── Phase 1: Discovery ──────────────────────────────────────────────────

async function discoverCandidates(chainId) {
  const candidates = [];
  const batchSize = 100; // 8004scan max per page
  let total = null;

  for (let offset = 0; ; offset += batchSize) {
    try {
      const url = `https://8004scan.io/api/v1/agents?sort_by=total_score&sort_order=desc&limit=${batchSize}&offset=${offset}` +
        (chainId ? `&chain_id=${chainId}` : '');
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) {
        console.error(`  List API error at offset ${offset}: ${resp.status}`);
        break;
      }
      const data = await resp.json();
      if (total === null) {
        total = data.total || 0;
        console.log(`  8004scan reports ${total} total agents`);
      }
      if (!data.items || data.items.length === 0) break;

      for (const item of data.items) {
        const hasScore = item.total_score > 0;
        const hasHealth = item.health_score !== null && item.health_score !== undefined;
        const hasProtocols = item.supported_protocols?.length > 0;

        // Include agents with: score > 0, or detected protocols, or health checked
        // Skip zero-score named-only agents (most are empty shells with just a name)
        if (hasScore || hasProtocols || hasHealth) {
          candidates.push({
            erc8004_id: parseInt(item.token_id),
            chain_id: item.chain_id,
            name: item.name,
            score: item.total_score,
            hasProtocols,
          });
        }
      }

      // Stop early if we've hit zero-score agents and no protocols
      // (sorted by score desc, so once score=0 with no protocols, rest are shells)
      const lastItem = data.items[data.items.length - 1];
      if (lastItem && lastItem.total_score === 0 && !lastItem.supported_protocols?.length) {
        // Check if ALL items in this batch are zero-score no-protocol
        const allZero = data.items.every(i => i.total_score === 0 && !i.supported_protocols?.length);
        if (allZero) {
          console.log(`  Stopping at offset ${offset} — all remaining agents are zero-score shells`);
          break;
        }
      }

      if (offset % 500 === 0 && offset > 0) {
        console.log(`  Discovery: ${offset}/${total} scanned, ${candidates.length} candidates so far`);
      }

      // Rate limit: 1 req/sec
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`  Discovery error at offset ${offset}:`, e.message);
      await new Promise(r => setTimeout(r, 5000));
      // Retry once
      try {
        const url = `https://8004scan.io/api/v1/agents?sort_by=total_score&sort_order=desc&limit=${batchSize}&offset=${offset}` +
          (chainId ? `&chain_id=${chainId}` : '');
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (resp.ok) {
          const data = await resp.json();
          if (data.items) {
            for (const item of data.items) {
              if (item.total_score > 0 || item.health_score != null || item.supported_protocols?.length > 0) {
                candidates.push({
                  erc8004_id: parseInt(item.token_id),
                  chain_id: item.chain_id,
                  name: item.name,
                  score: item.total_score,
                  hasProtocols: item.supported_protocols?.length > 0,
                });
              }
            }
          }
        }
      } catch {
        console.error(`  Retry failed at offset ${offset}, moving on`);
      }
    }
  }

  console.log(`  Discovery complete: ${candidates.length} candidates from ${total} total`);
  return candidates;
}

// ── Phase 2: Enrichment ─────────────────────────────────────────────────

/**
 * Fetch 8004scan detail API for a single agent and extract endpoints
 * from raw_metadata.offchain_content.
 *
 * This is the correct approach because:
 * - The detail API returns the FULL parsed agent.json
 * - We parse services[] ourselves with substring matching on name + type fallback
 * - We don't rely on supported_protocols (which misses most agents)
 */
async function enrichAgent(chainId, tokenId) {
  const url = `https://8004scan.io/api/v1/agents/${chainId}/${tokenId}`;
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'Accept': 'application/json' },
  });

  if (!resp.ok) return null;

  const text = await resp.text();
  // Handle redirects that return HTML instead of JSON
  if (text.startsWith('Redirecting') || text.startsWith('<')) return null;

  const data = JSON.parse(text);
  const offchain = data.raw_metadata?.offchain_content;

  // Start with what 8004scan already extracted
  let a2a = data.a2a_endpoint || null;
  let mcp = data.mcp_server || null;
  const name = data.name || null;
  const description = data.description || null;
  const metadataUri = data.raw_metadata?.offchain_uri || null;

  // Now parse offchain_content ourselves (the part 8004scan gets wrong)
  if (offchain) {
    const found = extractEndpointsFromMetadata(offchain);
    if (!a2a && found.a2a) a2a = found.a2a;
    if (!mcp && found.mcp) mcp = found.mcp;
  }

  return { a2a, mcp, name, description, metadataUri };
}

/**
 * Extract A2A and MCP endpoints from agent metadata.
 * Checks multiple locations with increasingly broad matching:
 *
 * 1. services[].name exact keyword match ("MCP", "A2A")
 * 2. services[].name substring match (contains "mcp" or "a2a")
 * 3. services[].type field match ("mcp", "a2a")
 * 4. Top-level endpoints object (endpoints.mcp, endpoints.a2a)
 * 5. Top-level fields (mcp_server, mcp_endpoint, a2a_endpoint, etc.)
 * 6. URL pattern matching (any URL containing /mcp, agent-card, .well-known/agent)
 */
function extractEndpointsFromMetadata(meta) {
  if (!meta || typeof meta !== 'object') return { a2a: null, mcp: null };
  let a2a = null, mcp = null;

  // 1. services[].name exact keyword match
  if (Array.isArray(meta.services)) {
    for (const svc of meta.services) {
      if (!svc || typeof svc !== 'object') continue;
      const url = svc.endpoint || svc.url;
      if (typeof url !== 'string' || !url.startsWith('http')) continue;
      const name = String(svc.name || '').toUpperCase().trim();
      if (name === 'A2A' && !a2a) a2a = url;
      if (name === 'MCP' && !mcp) mcp = url;
    }
  }

  // 2. services[].name substring match (catches "DrHobbs MCP Server", "My A2A Gateway", etc.)
  if (Array.isArray(meta.services)) {
    for (const svc of meta.services) {
      if (!svc || typeof svc !== 'object') continue;
      const url = svc.endpoint || svc.url;
      if (typeof url !== 'string' || !url.startsWith('http')) continue;
      const name = String(svc.name || '').toLowerCase();
      if (name.includes('a2a') && !a2a) a2a = url;
      if (name.includes('mcp') && !mcp) mcp = url;
    }
  }

  // 3. services[].type field match
  if (Array.isArray(meta.services)) {
    for (const svc of meta.services) {
      if (!svc || typeof svc !== 'object') continue;
      const url = svc.endpoint || svc.url;
      if (typeof url !== 'string' || !url.startsWith('http')) continue;
      const type = String(svc.type || '').toLowerCase();
      if (type === 'a2a' && !a2a) a2a = url;
      if (type === 'mcp' && !mcp) mcp = url;
    }
  }

  // 4. Top-level endpoints object
  if (meta.endpoints && typeof meta.endpoints === 'object' && !Array.isArray(meta.endpoints)) {
    const eps = meta.endpoints;
    if (!a2a) {
      const v = eps.a2a || eps.A2A;
      if (typeof v === 'string' && v.startsWith('http')) a2a = v;
      else if (Array.isArray(v) && v[0] && typeof v[0] === 'string') a2a = v[0];
    }
    if (!mcp) {
      const v = eps.mcp || eps.MCP;
      if (typeof v === 'string' && v.startsWith('http')) mcp = v;
      else if (Array.isArray(v) && v[0] && typeof v[0] === 'string') mcp = v[0];
    }
  }

  // 5. Top-level fields
  if (!a2a) a2a = httpStr(meta.a2a_endpoint) || httpStr(meta.a2a);
  if (!mcp) mcp = httpStr(meta.mcp_server) || httpStr(meta.mcp_endpoint) || httpStr(meta.mcp);

  // 6. URL pattern matching — scan all URLs in the metadata
  if (!a2a || !mcp) {
    const allUrls = flatExtractUrls(meta);
    if (!a2a) a2a = allUrls.find(u => u.toLowerCase().includes('agent-card') || u.toLowerCase().includes('.well-known/agent')) || null;
    if (!mcp) mcp = allUrls.find(u => u.toLowerCase().includes('/mcp') && !u.includes('8004scan')) || null;
  }

  return { a2a, mcp };
}

function httpStr(v) {
  return typeof v === 'string' && v.startsWith('http') ? v : null;
}

function flatExtractUrls(obj, depth = 0) {
  if (depth > 4) return [];
  const urls = [];
  if (typeof obj === 'string' && obj.startsWith('http')) urls.push(obj);
  if (Array.isArray(obj)) {
    for (const v of obj.slice(0, 30)) urls.push(...flatExtractUrls(v, depth + 1));
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const v of Object.values(obj).slice(0, 30)) urls.push(...flatExtractUrls(v, depth + 1));
  }
  return urls.filter(u => /^https?:\/\//i.test(u));
}

// ── Phase 3: Liveness ───────────────────────────────────────────────────

async function probeEndpoint(url, type) {
  try {
    if (type === 'a2a') {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'Accept': 'application/json' },
      });
      if (!resp.ok) return false;
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('json')) return false;
      const body = await resp.json();
      return !!(body.name || body.url || body.skills);
    }

    if (type === 'mcp') {
      const resp = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'rrg-verifier', version: '1.0.0' },
          },
        }),
      });
      return resp.status < 500;
    }
  } catch {
    return false;
  }
  return false;
}

// ── DB update ───────────────────────────────────────────────────────────

async function upsertCandidate(agent, chain, endpoint, channel, metadataUri, hasMcp, hasA2a) {
  const { data: existing } = await db.from('mkt_candidates')
    .select('id')
    .eq('erc8004_id', agent.erc8004_id)
    .eq('chain', chain)
    .limit(1);

  const record = {
    reachable: true,
    verified_endpoint: endpoint,
    metadata_url: metadataUri,
    has_mcp: hasMcp,
    has_a2a: hasA2a,
    updated_at: new Date().toISOString(),
  };

  if (existing && existing.length > 0) {
    await db.from('mkt_candidates').update(record).eq('id', existing[0].id);
  } else {
    await db.from('mkt_candidates').insert({
      ...record,
      erc8004_id: agent.erc8004_id,
      name: agent.name,
      chain,
      discovery_source: '8004scan',
      score: Math.round(agent.score || 50),
      tier: (agent.score || 50) >= 55 ? 'hot' : 'warm',
      outreach_status: 'pending',
    });
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const chainsToCheck = CHAIN_ARG === 'all'
    ? Object.keys(CHAIN_IDS)
    : [CHAIN_ARG];

  console.log(`verify-reachable v2: chains=${chainsToCheck.join(',')}, dry_run=${DRY_RUN}`);
  console.log(`Using three-phase pipeline: Discovery → Enrichment → Liveness\n`);

  let grandTotal = 0, grandCandidates = 0, grandEnriched = 0, grandReachable = 0;
  let grandNoEndpoints = 0, grandDead = 0, grandEnrichFail = 0;
  const allReachable = [];

  for (const chain of chainsToCheck) {
    const chainId = CHAIN_IDS[chain];
    if (!chainId) {
      console.log(`Unknown chain: ${chain}`);
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`CHAIN: ${chain.toUpperCase()} (chainId ${chainId})`);
    console.log(`${'='.repeat(60)}`);

    // ── Phase 1: Discovery ──
    console.log(`\n[Phase 1] Discovery — scanning 8004scan list API...`);
    const candidates = await discoverCandidates(chainId);
    grandTotal += candidates.length;

    // ── Phase 2: Enrichment ──
    console.log(`\n[Phase 2] Enrichment — fetching detail API for ${candidates.length} candidates...`);
    let enriched = 0, enrichFail = 0, noEndpoints = 0;
    const withEndpoints = []; // candidates that have at least one endpoint

    for (let i = 0; i < candidates.length; i++) {
      const agent = candidates[i];

      try {
        const detail = await enrichAgent(chainId, agent.erc8004_id);
        if (!detail) {
          enrichFail++;
          grandEnrichFail++;
          continue;
        }

        enriched++;
        grandEnriched++;

        // Update name from detail if we have a better one
        if (detail.name && !agent.name) agent.name = detail.name;

        if (detail.a2a || detail.mcp) {
          withEndpoints.push({
            ...agent,
            a2a: detail.a2a,
            mcp: detail.mcp,
            metadataUri: detail.metadataUri,
          });
        } else {
          noEndpoints++;
          grandNoEndpoints++;
        }
      } catch (e) {
        enrichFail++;
        grandEnrichFail++;
      }

      // Progress + rate limiting
      if (i % 50 === 0 && i > 0) {
        console.log(`  Enriched: ${i}/${candidates.length} (${withEndpoints.length} with endpoints)`);
      }
      // 1 req/sec to detail API
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`  Enrichment complete: ${enriched} fetched, ${withEndpoints.length} have endpoints, ${noEndpoints} no endpoints, ${enrichFail} failures`);

    // ── Phase 3: Liveness ──
    console.log(`\n[Phase 3] Liveness — health-checking ${withEndpoints.length} endpoints...`);
    let verified = 0, dead = 0;

    for (let i = 0; i < withEndpoints.length; i++) {
      const agent = withEndpoints[i];

      let a2aLive = false, mcpLive = false;
      if (agent.a2a) a2aLive = await probeEndpoint(agent.a2a, 'a2a');
      if (agent.mcp) mcpLive = await probeEndpoint(agent.mcp, 'mcp');

      if (a2aLive || mcpLive) {
        const endpoint = a2aLive ? agent.a2a : agent.mcp;
        const channel = a2aLive ? 'a2a' : 'mcp';
        verified++;
        grandReachable++;
        allReachable.push({
          name: agent.name, erc8004_id: agent.erc8004_id,
          chain, endpoint, channel, score: agent.score,
        });

        if (!DRY_RUN) {
          await upsertCandidate(agent, chain, endpoint, channel, agent.metadataUri, !!agent.mcp, !!agent.a2a);
        }
      } else {
        dead++;
        grandDead++;
        if (dead <= 10) {
          console.log(`  DEAD: #${agent.erc8004_id} ${agent.name} → a2a:${agent.a2a ?? '-'} mcp:${agent.mcp ?? '-'}`);
        }
      }

      if (i % 20 === 0 && i > 0) {
        console.log(`  Checked: ${i}/${withEndpoints.length} (${verified} live, ${dead} dead)`);
      }
      // Small delay between health checks
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n  CHAIN RESULTS: ${chain.toUpperCase()}`);
    console.log(`    Candidates:    ${candidates.length}`);
    console.log(`    Enriched:      ${enriched} (${enrichFail} failed)`);
    console.log(`    With endpoints: ${withEndpoints.length}`);
    console.log(`    No endpoints:  ${noEndpoints}`);
    console.log(`    VERIFIED LIVE: ${verified}`);
    console.log(`    Dead:          ${dead}`);
    grandCandidates += withEndpoints.length;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`GRAND TOTAL ACROSS ALL CHAINS`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Total scanned:     ${grandTotal}`);
  console.log(`  Enriched:          ${grandEnriched} (${grandEnrichFail} failed)`);
  console.log(`  With endpoints:    ${grandCandidates}`);
  console.log(`  No endpoints:      ${grandNoEndpoints}`);
  console.log(`  VERIFIED REACHABLE: ${grandReachable}`);
  console.log(`  Dead endpoints:    ${grandDead}`);

  if (allReachable.length > 0) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`VERIFIED REACHABLE AGENTS`);
    console.log(`${'='.repeat(60)}`);
    for (const a of allReachable) {
      console.log(`  #${a.erc8004_id} ${a.name} [${a.chain}] (score:${a.score?.toFixed(1)}) → ${a.channel}: ${a.endpoint}`);
    }
  }
}

main().catch(console.error);
