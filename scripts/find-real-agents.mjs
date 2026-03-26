import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  const { data } = await db.from('mkt_candidates')
    .select('id, name, metadata_url, score, tier, outreach_status')
    .like('metadata_url', 'data:%')
    .or('has_mcp.eq.true,has_a2a.eq.true')
    .order('score', { ascending: false })
    .limit(300);

  let real = 0, fake = 0;
  const realAgents = [];

  for (const c of (data || [])) {
    try {
      const b64 = c.metadata_url.slice('data:application/json;base64,'.length);
      const meta = JSON.parse(Buffer.from(b64, 'base64').toString());
      const str = JSON.stringify(meta);
      const urls = str.match(/https?:\/\/[^"\s,}]+/g) || [];
      const realUrls = urls.filter(u => !u.match(/\.agent[/"]/));

      if (realUrls.length === 0) {
        fake++;
      } else {
        real++;
        realAgents.push({
          name: c.name,
          score: c.score,
          tier: c.tier,
          status: c.outreach_status,
          urls: realUrls.slice(0, 3),
        });
      }
    } catch {
      fake++;
    }
  }

  console.log('Real domain agents:', real);
  console.log('Fake .agent TLD:', fake);
  console.log('\nReal agents:');
  for (const a of realAgents) {
    console.log(JSON.stringify(a));
  }
}

main().catch(console.error);
