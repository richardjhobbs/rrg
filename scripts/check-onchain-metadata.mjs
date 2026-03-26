/**
 * Check on-chain tokenURI for hot agents to see if real endpoints are there.
 * This is the missing step — 8004scan tells us agents support MCP/A2A but
 * doesn't give endpoint URLs. The on-chain metadata does.
 */
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BASE_RPC_URL);
const abi = ['function tokenURI(uint256 tokenId) view returns (string)'];
const contract = new ethers.Contract(REGISTRY, abi, provider);

async function resolveMetadata(uri) {
  if (uri.startsWith('data:application/json;base64,')) {
    return JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
  }
  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '');
    const resp = await fetch(`https://ipfs.io/ipfs/${cid}`, { signal: AbortSignal.timeout(10000) });
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

  const eps = meta.endpoints;
  let a2a = meta.a2a_endpoint || meta.a2a || null;
  let mcp = meta.mcp_endpoint || meta.mcp_server || meta.mcp || null;
  let web = meta.agent_url || meta.external_url || meta.homepage || null;

  // Search endpoints array [{type, url}]
  if (Array.isArray(eps)) {
    for (const ep of eps) {
      if (!ep || typeof ep !== 'object') continue;
      const type = String(ep.type || ep.name || '').toLowerCase();
      const url = ep.url || ep.endpoint;
      if (typeof url !== 'string' || !url.startsWith('http')) continue;
      if (type === 'a2a' && !a2a) a2a = url;
      if (type === 'mcp' && !mcp) mcp = url;
      if (type === 'web' && !web) web = url;
    }
  }

  // Search services array [{name, endpoint}]
  if (Array.isArray(meta.services)) {
    for (const svc of meta.services) {
      if (!svc || typeof svc !== 'object') continue;
      const name = String(svc.name || '').toLowerCase();
      const url = svc.endpoint;
      if (typeof url !== 'string' || !url.startsWith('http')) continue;
      if (name === 'a2a' && !a2a) a2a = url;
      if (name === 'mcp' && !mcp) mcp = url;
      if (name === 'web' && !web) web = url;
    }
  }

  return { a2a, mcp, web };
}

async function main() {
  // Get hot agents on Base with MCP/A2A from 8004scan
  const { data: agents } = await db.from('mkt_candidates')
    .select('id, name, erc8004_id, score, chain')
    .eq('tier', 'hot')
    .or('has_mcp.eq.true,has_a2a.eq.true')
    .eq('chain', 'base')
    .not('erc8004_id', 'is', null)
    .order('score', { ascending: false })
    .limit(30);

  console.log(`Checking on-chain tokenURI for ${agents?.length ?? 0} hot Base agents...\n`);

  let hasEndpoints = 0;
  let noEndpoints = 0;
  let errors = 0;
  let ipfsNeeded = 0;

  for (const agent of (agents || [])) {
    try {
      const uri = await contract.tokenURI(agent.erc8004_id);
      const uriType = uri.startsWith('data:') ? 'data:' :
                       uri.startsWith('ipfs://') ? 'ipfs:' :
                       uri.startsWith('http') ? 'http:' : 'other';

      let meta = null;
      try {
        meta = await resolveMetadata(uri);
      } catch {
        if (uriType === 'ipfs:') {
          ipfsNeeded++;
          console.log(`  #${agent.erc8004_id} ${agent.name} → ${uriType} (IPFS fetch failed, endpoint likely there)`);
          continue;
        }
      }

      const eps = extractEndpoints(meta);
      const hasEp = !!(eps.a2a || eps.mcp || eps.web);

      if (hasEp) {
        hasEndpoints++;
        console.log(`✅ #${agent.erc8004_id} ${agent.name} → A2A:${eps.a2a ?? '-'} MCP:${eps.mcp ?? '-'} Web:${eps.web ?? '-'}`);
      } else {
        noEndpoints++;
        console.log(`⬚  #${agent.erc8004_id} ${agent.name} → ${uriType} no endpoints found`);
      }
    } catch (e) {
      errors++;
      console.log(`❌ #${agent.erc8004_id} ${agent.name} → ${e.message?.slice(0, 80)}`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Has endpoints: ${hasEndpoints}`);
  console.log(`No endpoints:  ${noEndpoints}`);
  console.log(`IPFS pending:  ${ipfsNeeded}`);
  console.log(`Errors:        ${errors}`);
  console.log(`Total checked: ${(agents || []).length}`);
}

main().catch(console.error);
