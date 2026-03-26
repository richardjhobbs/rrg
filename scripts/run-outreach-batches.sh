#!/bin/bash
cd /home/agent/apps/rrg
SECRET=$(grep '^ADMIN_SECRET=' .env.local | cut -d= -f2)

for i in $(seq 1 10); do
  echo "=== Batch $i (500 agents) === $(date)"
  RESULT=$(curl -s -X POST "http://localhost:3001/api/rrg/admin/marketing/outreach" \
    -H "Content-Type: application/json" \
    -H "x-admin-secret: $SECRET" \
    -d '{"limit": 500, "channel": "mcp"}' 2>&1)

  echo "$RESULT" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try {
        const j=JSON.parse(d);
        const s=j.summary||{};
        console.log('  Delivered:', s.delivered||0, '| Bounced:', s.bounced||0, '| Failed:', s.failed||0, '| Total:', s.total||0);
      } catch(e) { console.log('  Error:', d.slice(0,200)); }
    });
  "

  TOTAL=$(echo "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).summary.total||0)}catch{console.log(0)}})")
  if [ "$TOTAL" = "0" ]; then
    echo "  No more pending agents. Stopping."
    break
  fi

  echo "  Sleeping 30s before next batch..."
  sleep 30
done
echo "=== ALL BATCHES COMPLETE === $(date)"
