/**
 * Send outreach to agents with data: URI metadata (actually deliverable).
 * Sends them individually via the outreach API.
 *
 * Usage: ADMIN_SECRET=xxx node scripts/batch-outreach-datauri.mjs [limit]
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const LIMIT = parseInt(process.argv[2] || '50', 10);

if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_SECRET) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_SECRET');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Get pending hot agents with data: URI metadata
  const { data: candidates } = await db
    .from('mkt_candidates')
    .select('id, name, score')
    .eq('outreach_status', 'pending')
    .eq('tier', 'hot')
    .like('metadata_url', 'data:%')
    .or('has_mcp.eq.true,has_a2a.eq.true')
    .order('score', { ascending: false })
    .limit(LIMIT);

  console.log(`Found ${candidates?.length ?? 0} deliverable candidates (limit ${LIMIT})`);
  if (!candidates?.length) return;

  let delivered = 0, bounced = 0, failed = 0, sent = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      const resp = await fetch('http://localhost:3001/api/rrg/admin/marketing/outreach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': ADMIN_SECRET,
        },
        body: JSON.stringify({
          candidate_id: c.id,
          channel: 'a2a',
          message_type: 'intro',
        }),
      });
      const result = await resp.json();
      const status = result.status ?? 'unknown';
      if (status === 'delivered') delivered++;
      else if (status === 'bounced') bounced++;
      else if (status === 'failed') failed++;
      else if (status === 'sent') sent++;

      const icon = status === 'delivered' ? '✅' : status === 'bounced' ? '🔴' : status === 'failed' ? '❌' : '📤';
      console.log(`${icon} [${i + 1}/${candidates.length}] ${c.name ?? c.id} (score:${c.score}) → ${status} ${result.endpoint ?? ''} ${result.error ?? ''}`);
    } catch (err) {
      failed++;
      console.log(`❌ [${i + 1}/${candidates.length}] ${c.name ?? c.id} → ERROR: ${err.message}`);
    }

    // 200ms delay
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone! Delivered: ${delivered}, Bounced: ${bounced}, Failed: ${failed}, Sent: ${sent}, Total: ${candidates.length}`);
}

main().catch(console.error);
