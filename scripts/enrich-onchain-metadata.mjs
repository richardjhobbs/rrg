/**
 * Batch-read on-chain tokenURI for all hot agents with MCP/A2A on Base.
 * Updates metadata_url in DB with the real on-chain URI.
 *
 * Usage: node scripts/enrich-onchain-metadata.mjs [limit] [--dry-run]
 */
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BASE_RPC_URL);
const abi = ['function tokenURI(uint256 tokenId) view returns (string)'];
const contract = new ethers.Contract(REGISTRY, abi, provider);

const LIMIT = parseInt(process.argv[2] || '500', 10);
const DRY_RUN = process.argv.includes('--dry-run');

async function resolveMetadata(uri) {
  if (uri.startsWith('data:application/json;base64,')) {
    return JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
  }
  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '');
    const resp = await fetch(`https://ipfs.io/ipfs/${cid}`, { signal: AbortSignal.timeout(15000) });
    if (resp.ok) return resp.json();
  }
  if (uri.startsWith('http')) {
    const resp = await fetch(uri, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) return resp.json();
  }
  return null;
}

function extractEndpoints(meta) {
  if (!meta) return { a2a: null, mcp: null, web: null };
  let a2a = null, mcp = null, web = null;

  // Direct fields
  a2a = a2a || strField(meta, 'a2a_endpoint') || strField(meta, 'a2a');
  mcp = mcp || strField(meta, 'mcp_endpoint') || strField(meta, 'mcp_server') || strField(meta, 'mcp');
  web = web || strField(meta, 'agent_url') || strField(meta, 'external_url') || strField(meta, 'homepage');

  // endpoints array [{type, url}]
  if (Array.isArray(meta.endpoints)) {
    for (const ep of meta.endpoints) {
      if (!ep || typeof ep !== 'object') continue;
      const type = String(ep.type || ep.name || '').toLowerCase();
      const url = ep.url || ep.endpoint;
      if (typeof url !== 'string' || !url.startsWith('http')) continue;
      if (type === 'a2a' && !a2a) a2a = url;
      if (type === 'mcp' && !mcp) mcp = url;
      if ((type === 'web' || type === 'api') && !web) web = url;
    }
  }

  // services array [{name, endpoint}]
  if (Array.isArray(meta.services)) {
    for (const svc of meta.services) {
      if (!svc || typeof svc !== 'object') continue;
      const name = String(svc.name || '').toLowerCase();
      const url = svc.endpoint;
      if (typeof url !== 'string' || !url.startsWith('http')) continue;
      if (name === 'a2a' && !a2a) a2a = url;
      if (name === 'mcp' && !mcp) mcp = url;
      if ((name === 'web' || name === 'api') && !web) web = url;
    }
  }

  return { a2a, mcp, web };
}

function strField(obj, key) {
  const v = obj[key];
  return typeof v === 'string' && v.startsWith('http') ? v : null;
}

function isFakeDomain(url) {
  if (!url) return false;
  return /\.(agent|op)\b/.test(url) && !url.includes('agent.json');
}

async function main() {
  // Get Base agents with MCP/A2A that still have 8004scan page URLs
  const { data: agents } = await db.from('mkt_candidates')
    .select('id, name, erc8004_id, score, tier, metadata_url, has_mcp, has_a2a')
    .or('has_mcp.eq.true,has_a2a.eq.true')
    .eq('chain', 'base')
    .not('erc8004_id', 'is', null)
    .order('score', { ascending: false })
    .limit(LIMIT);

  console.log(`Enriching ${agents?.length ?? 0} Base agents (limit ${LIMIT}, dry_run=${DRY_RUN})...\n`);

  let enriched = 0, noUri = 0, hasEndpoints = 0, fakeEndpoints = 0, ipfsPending = 0, errors = 0;
  const reachable = [];

  for (let i = 0; i < (agents || []).length; i++) {
    const agent = agents[i];

    try {
      const uri = await contract.tokenURI(agent.erc8004_id);

      // Resolve the metadata
      let meta = null;
      try {
        meta = await resolveMetadata(uri);
      } catch (e) {
        if (uri.startsWith('ipfs://')) {
          ipfsPending++;
          if (i % 50 === 0) process.stdout.write(`[${i}/${agents.length}] `);
          continue;
        }
      }

      const eps = extractEndpoints(meta);
      const hasRealEndpoint = !!(eps.a2a || eps.mcp) && !isFakeDomain(eps.a2a) && !isFakeDomain(eps.mcp);

      if (hasRealEndpoint) {
        hasEndpoints++;
        reachable.push({ id: agent.id, name: agent.name, erc8004_id: agent.erc8004_id, score: agent.score, ...eps });

        // Update DB with real metadata URI
        if (!DRY_RUN) {
          await db.from('mkt_candidates').update({
            metadata_url: uri,
            updated_at: new Date().toISOString(),
          }).eq('id', agent.id);
        }
        enriched++;
      } else if (eps.a2a || eps.mcp) {
        fakeEndpoints++;
      }

    } catch (e) {
      // tokenURI reverted — no metadata set
      noUri++;
    }

    if (i % 50 === 0) process.stdout.write(`[${i}/${agents.length}] `);

    // Small delay to avoid RPC rate limiting
    if (i % 10 === 0) await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n\n=== Results ===`);
  console.log(`Total checked:    ${(agents || []).length}`);
  console.log(`No tokenURI:      ${noUri} (shell registrations)`);
  console.log(`Real endpoints:   ${hasEndpoints} (updated in DB)`);
  console.log(`Fake endpoints:   ${fakeEndpoints} (.agent/.op TLD)`);
  console.log(`IPFS pending:     ${ipfsPending}`);
  console.log(`DB updated:       ${enriched}`);
  console.log(`Errors:           ${errors}`);

  if (reachable.length > 0) {
    console.log(`\n=== Reachable Agents ===`);
    for (const a of reachable) {
      console.log(`  #${a.erc8004_id} ${a.name} (score:${a.score})`);
      if (a.a2a) console.log(`    A2A: ${a.a2a}`);
      if (a.mcp) console.log(`    MCP: ${a.mcp}`);
      if (a.web) console.log(`    Web: ${a.web}`);
    }
  }
}

main().catch(console.error);
