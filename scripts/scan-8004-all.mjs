#!/usr/bin/env node
/**
 * Full 8004scan.io agent scan — paginates through ALL registered ERC-8004 agents
 * (110K+) and upserts into mkt_candidates.
 *
 * Run:
 *   node scripts/scan-8004-all.mjs
 *   node scripts/scan-8004-all.mjs --offset=10000   # resume from offset
 *
 * Uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY from .env.local
 * Uses "RRG" (agent #33313) as the discovered_by agent.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(__dirname, '../.env.local');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
    process.env[key] = val;
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Config ───────────────────────────────────────────────────────────────────
const BATCH_LIMIT    = 100;         // agents per API page (8004scan max is 100)
const MIN_SCORE      = 20;          // minimum score to insert (erc8004 baseline)
const DELAY_MS       = 300;         // pause between API pages
const OWN_CHAIN      = 'base';
const OWN_TOKEN_IDS  = new Set([17666, 26244]);   // DrHobbs, DEPLOYER

// RRG platform agent (#33313) as the discoverer
const RRG_AGENT_ID   = null;        // will be fetched on start

const API_BASE       = 'https://8004scan.io/api/v1/agents';

// ── Chain map ────────────────────────────────────────────────────────────────
const CHAIN_MAP = {
  8453: 'base', 1: 'ethereum', 56: 'bnb', 100: 'gnosis',
  42220: 'celo', 42161: 'arbitrum', 10: 'optimism', 137: 'polygon',
  43114: 'avalanche', 59144: 'linea', 534352: 'scroll',
};

// ── Scoring ──────────────────────────────────────────────────────────────────
function detectCreative(text) {
  return /image|art|design|generat|dall|stable|midjourney|creative|visual|nft|fashion|style|draw|paint|illustrat|photo|canvas|pixel|render|composit/i.test(text);
}

function tierFromScore(score) {
  if (score >= 55) return 'hot';
  if (score >= 30) return 'warm';
  return 'cold';
}

function scoreAgent(item) {
  let score = 0;
  const parts = [];
  const protocols = item.supported_protocols ?? [];
  const allText = `${item.name ?? ''} ${item.description ?? ''}`.toLowerCase();

  // ERC-8004 registered — guaranteed baseline
  score += 20; parts.push('+20 erc8004');

  if (item.name?.trim().length > 1)      { score += 5; parts.push('+5 named'); }
  if (item.description?.length > 20)     { score += 5; parts.push('+5 described'); }

  // Health score (0–100)
  const h = item.health_score;
  if (h != null) {
    if (h >= 80)      { score += 15; parts.push(`+15 health(${h})`); }
    else if (h >= 50) { score +=  8; parts.push(`+8 health(${h})`);  }
    else if (h >= 20) { score +=  3; parts.push(`+3 health(${h})`);  }
  }

  // Protocol capabilities
  const hasMcp = protocols.includes('MCP');
  const hasA2a = protocols.includes('A2A');
  if (hasMcp)            { score += 15; parts.push('+15 mcp'); }
  if (hasA2a)            { score += 10; parts.push('+10 a2a'); }
  if (item.x402_supported) { score += 8; parts.push('+8 x402'); }
  if (item.is_verified)  { score +=  5; parts.push('+5 verified'); }

  // Creative keyword detection
  const hasImageGen = detectCreative(allText);
  if (hasImageGen) { score += 10; parts.push('+10 creative'); }

  const chainName = CHAIN_MAP[item.chain_id] ?? `chain_${item.chain_id}`;
  const tokenId   = parseInt(item.token_id, 10);

  return {
    chain:          chainName,
    erc8004_id:     isNaN(tokenId) ? null : tokenId,
    wallet_address: item.owner_address ?? null,
    name:           item.name ?? null,
    description:    item.description ? item.description.slice(0, 2000) : null,
    platform:       '8004scan',
    metadata_url:   `https://8004scan.io/agents/${item.agent_id}`,
    score,
    tier:           tierFromScore(score),
    scoring_notes:  parts.join(', '),
    has_wallet:     !!item.owner_address,
    has_mcp:        hasMcp,
    has_a2a:        hasA2a,
    has_image_gen:  hasImageGen,
  };
}

// ── Resolve RRG agent ID ─────────────────────────────────────────────────────
async function getRrgAgentId() {
  // Try to find RRG platform agent (erc8004_id 33313 on base)
  const { data } = await supabase
    .from('mkt_agents')
    .select('id')
    .or('name.ilike.%RRG%,name.ilike.%realrealgenuine%')
    .limit(1)
    .single();
  if (data) return data.id;

  // Fall back to DrHobbs
  const { data: dh } = await supabase
    .from('mkt_agents')
    .select('id')
    .ilike('wallet_address', '0xe65380%')
    .single();
  return dh?.id ?? null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const startOffset = (() => {
  const arg = process.argv.find(a => a.startsWith('--offset='));
  return arg ? parseInt(arg.split('=')[1], 10) : 0;
})();

const discoveredBy = await getRrgAgentId();
console.log(`\n🔍 8004scan FULL scan`);
console.log(`   Discovered by: ${discoveredBy ?? '(none)'}`);
console.log(`   Starting at offset: ${startOffset}`);
console.log(`   Batch size: ${BATCH_LIMIT} | Delay: ${DELAY_MS}ms\n`);

let totalScanned = 0, totalNew = 0, totalUpdated = 0, totalSkipped = 0, totalErrors = 0;
let offset = startOffset;

while (true) {
  const url = `${API_BASE}?limit=${BATCH_LIMIT}&offset=${offset}`;
  let data;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; RRG-Scanner/1.0)',
      },
    });

    if (!res.ok) {
      console.error(`offset ${offset}: HTTP ${res.status} — retrying in 3s`);
      totalErrors++;
      await sleep(3000);
      // Don't advance offset — retry same page
      continue;
    }

    data = await res.json();
  } catch (err) {
    console.error(`offset ${offset}: fetch error — ${err.message} — retrying in 5s`);
    totalErrors++;
    await sleep(5000);
    continue;
  }

  const items = data.items ?? [];
  const total = data.total ?? 0;

  if (!Array.isArray(items) || items.length === 0) {
    console.log(`\noffset ${offset}: no items returned — scan complete.`);
    break;
  }

  let pageNew = 0, pageUpdated = 0, pageSkipped = 0, pageErrors = 0;

  for (const item of items) {
    // Skip testnet agents
    if (item.is_testnet) { pageSkipped++; totalSkipped++; continue; }

    // Skip our own agents
    const tokenId = parseInt(item.token_id, 10);
    const chainName = CHAIN_MAP[item.chain_id] ?? `chain_${item.chain_id}`;
    if (chainName === OWN_CHAIN && OWN_TOKEN_IDS.has(tokenId)) continue;

    const scored = scoreAgent(item);
    if (scored.score < MIN_SCORE || scored.erc8004_id == null) {
      pageSkipped++; totalSkipped++;
      continue;
    }

    totalScanned++;

    try {
      // Check existing by erc8004_id + chain
      const { data: existing } = await supabase
        .from('mkt_candidates')
        .select('id, score')
        .eq('erc8004_id', scored.erc8004_id)
        .eq('chain', scored.chain)
        .single();

      if (existing) {
        const newScore = Math.max(existing.score, scored.score);
        await supabase
          .from('mkt_candidates')
          .update({
            name:           scored.name ?? undefined,
            wallet_address: scored.wallet_address ?? undefined,
            description:    scored.description ?? undefined,
            platform:       scored.platform,
            metadata_url:   scored.metadata_url,
            score:          newScore,
            tier:           tierFromScore(newScore),
            scoring_notes:  scored.scoring_notes,
            has_mcp:        scored.has_mcp || undefined,
            has_a2a:        scored.has_a2a || undefined,
            has_image_gen:  scored.has_image_gen || undefined,
            updated_at:     new Date().toISOString(),
          })
          .eq('id', existing.id);
        pageUpdated++; totalUpdated++;
      } else {
        const row = {
          chain:            scored.chain,
          erc8004_id:       scored.erc8004_id,
          wallet_address:   scored.wallet_address,
          name:             scored.name,
          description:      scored.description,
          platform:         scored.platform,
          metadata_url:     scored.metadata_url,
          discovery_source: '8004scan',
          score:            scored.score,
          tier:             scored.tier,
          scoring_notes:    scored.scoring_notes,
          has_wallet:       scored.has_wallet,
          has_mcp:          scored.has_mcp,
          has_a2a:          scored.has_a2a,
          has_image_gen:    scored.has_image_gen,
          on_chain_txns:    0,
          outreach_status:  'pending',
          contact_count:    0,
        };
        if (discoveredBy) row.discovered_by = discoveredBy;

        const { error } = await supabase.from('mkt_candidates').insert(row);
        if (error) { pageErrors++; totalErrors++; }
        else        { pageNew++;    totalNew++;    }
      }
    } catch (err) {
      pageErrors++;
      totalErrors++;
    }
  }

  const pct = total > 0 ? ` (${(((offset + BATCH_LIMIT) / total) * 100).toFixed(1)}%)` : '';
  console.log(
    `offset ${String(offset).padStart(6)} | +${String(pageNew).padStart(4)} new` +
    ` ~${String(pageUpdated).padStart(4)} upd` +
    ` /${String(pageSkipped).padStart(3)} skip` +
    `${pageErrors ? ` !${pageErrors}err` : ''}` +
    ` | total: ${totalNew.toLocaleString()}↑ ${totalUpdated.toLocaleString()}~` +
    ` | of ${total.toLocaleString()}${pct}`
  );

  // End of results
  if (offset + BATCH_LIMIT >= total) {
    console.log(`\nReached end of data (total: ${total.toLocaleString()}).`);
    break;
  }

  offset += BATCH_LIMIT;
  await sleep(DELAY_MS);
}

console.log(`\n✅ Scan complete!`);
console.log(`   Scanned:  ${totalScanned.toLocaleString()} agents (above score threshold)`);
console.log(`   New:      ${totalNew.toLocaleString()}`);
console.log(`   Updated:  ${totalUpdated.toLocaleString()}`);
console.log(`   Skipped:  ${totalSkipped.toLocaleString()} (testnet/below threshold)`);
console.log(`   Errors:   ${totalErrors.toLocaleString()}`);
