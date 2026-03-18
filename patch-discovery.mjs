// Add resources to GET /mcp discovery page
import fs from 'fs/promises';

const FILE = '/home/agent/agents/drhobbs-8004/mcp-server/src/index.js';
let content = await fs.readFile(FILE, 'utf8');

// Find the links block near the end of the discovery object and add resources after it
const OLD = `    links: {
      catalogue: "https://richard-hobbs.com/api/catalogue",
      rrg_marketplace: "https://richard-hobbs.com/rrg",
      agent_json: "https://richard-hobbs.com/agent.json",
      well_known_pay: "https://richard-hobbs.com/.well-known/pay"
    }
  };
  res.status(200).json(discovery);`;

const NEW = `    resources: [
      {
        uri: "rrg://platform/info",
        name: "RRG Platform Info",
        description: "Complete structured info about RRG: history, payment, eligibility, tools",
        mimeType: "application/json"
      },
      {
        uri: "rrg://platform/guidelines",
        name: "RRG Submission Guidelines",
        description: "Creative philosophy, what makes a strong submission, social promotion, and platform vision — read before submitting",
        mimeType: "text/markdown"
      }
    ],
    links: {
      catalogue: "https://richard-hobbs.com/api/catalogue",
      rrg_marketplace: "https://richard-hobbs.com/rrg",
      agent_json: "https://richard-hobbs.com/agent.json",
      well_known_pay: "https://richard-hobbs.com/.well-known/pay"
    }
  };
  res.status(200).json(discovery);`;

if (!content.includes(OLD)) {
  console.error('OLD links block not found'); process.exit(1);
}

content = content.replace(OLD, NEW);
await fs.writeFile(FILE, content, 'utf8');
console.log('Done — resources added to GET /mcp discovery');
console.log('rrg://platform/guidelines in discovery:', content.includes('rrg://platform/guidelines'));
