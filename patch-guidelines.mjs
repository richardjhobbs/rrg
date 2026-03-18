// Patch script — adds guidelines resource references to index.js
// Run on VPS: node /tmp/patch-guidelines.mjs

import fs from 'fs/promises';

const FILE = '/home/agent/agents/drhobbs-8004/mcp-server/src/index.js';
const BACKUP = FILE + '.bak2';

let content = await fs.readFile(FILE, 'utf8');
await fs.writeFile(BACKUP, content, 'utf8');
console.log('Backup written to', BACKUP);

let changes = 0;

// ── Change 1: get_current_brief — update guidelines field + add guidelinesResource
// Old line in howToSubmit:
const OLD_GUIDELINES = `          guidelines: 'Be original. Respond directly to the brief. The more specific your description (materials, construction, mood), the stronger the submission.'`;
const NEW_GUIDELINES = `          guidelines: 'Read rrg://platform/guidelines for full creative and commercial guidance. In brief: respond to the brief, push the concept, think about what will make someone want to own it — and let that drive the title, description, and bio.',
          guidelinesResource: 'rrg://platform/guidelines'`;

if (content.includes(OLD_GUIDELINES)) {
  content = content.replace(OLD_GUIDELINES, NEW_GUIDELINES);
  changes++;
  console.log('Change 1 applied: get_current_brief guidelines field updated');
} else {
  console.error('Change 1 NOT FOUND — guidelines field in get_current_brief');
}

// ── Change 2: submit_rrg_design description — add guidelines reference near top
// Add after "BEFORE GENERATING YOUR IMAGE — read this spec in full:"
const OLD_BEFORE = `BEFORE GENERATING YOUR IMAGE — read this spec in full:

REQUIRED PARAMETERS:`;
const NEW_BEFORE = `BEFORE GENERATING YOUR IMAGE:
  1. Read the current brief with get_current_brief
  2. Read the submission guidelines at rrg://platform/guidelines
     (creative philosophy, naming advice, promotion, platform vision)

REQUIRED PARAMETERS:`;

if (content.includes(OLD_BEFORE)) {
  content = content.replace(OLD_BEFORE, NEW_BEFORE);
  changes++;
  console.log('Change 2 applied: submit_rrg_design description updated');
} else {
  console.error('Change 2 NOT FOUND — BEFORE GENERATING block in submit_rrg_design');
}

await fs.writeFile(FILE, content, 'utf8');
console.log(`Done — ${changes}/2 changes applied`);

// Verify
const verify = await fs.readFile(FILE, 'utf8');
console.log('Verify guidelinesResource:', verify.includes('guidelinesResource'));
console.log('Verify rrg://platform/guidelines:', (verify.match(/rrg:\/\/platform\/guidelines/g) || []).length, 'occurrences');
