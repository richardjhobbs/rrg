// Patch script — replaces submit_rrg_design tool in DrHobbs MCP server
// Run on VPS: node /tmp/patch-submit-tool.mjs

import fs from 'fs/promises';
import path from 'path';

const FILE = '/home/agent/agents/drhobbs-8004/mcp-server/src/index.js';
const BACKUP = FILE + '.bak';

const START_MARKER = '// --- Tool: submit_rrg_design ---';
const END_MARKER   = '// ============================================\n// RRG PLATFORM RESOURCE';

let content = await fs.readFile(FILE, 'utf8');

// Backup first
await fs.writeFile(BACKUP, content, 'utf8');
console.log('Backup written to', BACKUP);

const startIdx = content.indexOf(START_MARKER);
const endIdx   = content.indexOf(END_MARKER);

if (startIdx === -1) { console.error('START_MARKER not found'); process.exit(1); }
if (endIdx   === -1) { console.error('END_MARKER not found');   process.exit(1); }
if (endIdx <= startIdx) { console.error('END_MARKER before START_MARKER'); process.exit(1); }

console.log(`Replacing lines ${startIdx}–${endIdx} (${endIdx - startIdx} chars)`);

const NEW_TOOL = `// --- Tool: submit_rrg_design ---
server.registerTool(
  'submit_rrg_design',
  {
    title: 'Submit Design to RRG',
    description: \`Submit a design to Real Real Genuine (RRG) for review and potential NFT publication.

BEFORE GENERATING YOUR IMAGE — read this spec in full:

REQUIRED PARAMETERS:
  title          — Design title, max 60 characters
  creator_wallet — Your Base wallet address (0x...). 70% of every sale paid here as USDC.
  image          — Provide exactly ONE of the options below.

IMAGE OPTIONS (choose the one that suits your runtime):

  image_path (PREFERRED when you can write files to disk)
    Absolute path to a saved JPEG or PNG on the local filesystem, e.g. /tmp/design.jpg
    Read server-side — no base64 encoding needed, no truncation risk.

  openclaw_artifact_id (use when your image is in the OpenClaw inbound directory)
    The UUID of an artifact in /home/agent/.openclaw/media/inbound/
    Files are named {description}---{uuid}.{ext} — pass just the UUID part.
    Example: "de77dc9a-0ceb-43ab-9808-3e64c2963f6f"

  image_url (use when the image is already publicly hosted)
    A fully accessible HTTPS URL to a JPEG or PNG. Server fetches it directly.
    Best when no local filesystem access is available but image is hosted somewhere.

  image_chunks (use when base64 is too large for a single string field)
    A JSON array of base64 strings concatenated server-side before decoding.
    Split your base64 output into chunks of any size and send as an array.
    A data URI prefix on the first chunk is stripped automatically.
    Example: ["data:image/jpeg;base64,/9j/4AA...", "...continued...", "...final chunk"]

  ipfs_cid (use when the image is already pinned to IPFS)
    The IPFS content identifier (CID) of a JPEG or PNG.
    Server fetches from Pinata gateway with ipfs.io and Cloudflare as fallbacks.
    Example: "bafybeicdoj2qq3rureig3duixcowasxuxvqy6o7ysn5xajkotbi63az5ey"

  image_base64 (last resort — model may truncate long strings)
    Raw base64 or data URI (data:image/jpeg;base64,...). Use only if none of the
    above options work. If truncation occurs, switch to image_chunks instead.

IMAGE REQUIREMENTS:
  Format:      JPEG or PNG only (validated by magic bytes, not filename or content-type)
  Max size:    5 MB
  Recommended: 1024×1024

OPTIONAL PARAMETERS:
  description          — Max 280 chars. Describe materials, mood, construction details.
  creator_email        — Notified on approval or rejection
  suggested_edition    — Suggested edition size, e.g. "10" (reviewer sets final value)
  suggested_price_usdc — Suggested price in USDC, e.g. "15" (reviewer sets final value)
  creator_bio          — Shown on gallery page, max 500 chars, URLs become clickable links

WORKFLOW:
  1. Call get_current_brief to read the active brief
  2. Design your concept to fit the brief
  3. Get your image using whichever method your runtime supports (see options above)
  4. Call this tool with the appropriate image parameter

AFTER SUBMISSION:
  - Designs reviewed manually by Richard Hobbs (typically 2-5 days)
  - If approved: listed as ERC-1155 NFT drop on Base at https://richard-hobbs.com/rrg
  - On each sale: 70% of the USDC price sent automatically to creator_wallet\`,
    inputSchema: z.object({
      title: z.string().max(60).describe('Design title (max 60 characters)'),
      image_path: z.string().optional().describe('PREFERRED: Absolute path to a JPEG or PNG on the local filesystem (e.g. /tmp/design.png). No base64 needed, no truncation risk.'),
      openclaw_artifact_id: z.string().optional().describe('UUID of an artifact in the OpenClaw inbound directory (/home/agent/.openclaw/media/inbound/). Files are named {desc}---{uuid}.{ext} — pass just the UUID.'),
      image_url: z.string().url().optional().describe('Public HTTPS URL to a JPEG or PNG. Server fetches it. Use when image is already hosted and no local file is available.'),
      image_chunks: z.array(z.string()).optional().describe('Base64 split into an array of strings — concatenated server-side before decoding. Solves context/field-size limits. Data URI prefix on first chunk is stripped automatically.'),
      ipfs_cid: z.string().optional().describe('IPFS CID of a JPEG or PNG already pinned to IPFS. Server fetches via Pinata, ipfs.io, and Cloudflare gateways.'),
      image_base64: z.string().optional().describe('Base64-encoded JPEG or PNG (raw or data URI). Last resort — model may truncate long strings. Prefer image_path or image_chunks.'),
      creator_wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Your Base wallet address (0x...) — 70% of sales sent here as USDC'),
      description: z.string().max(280).optional().describe('Description of the design (max 280 chars)'),
      creator_email: z.string().email().optional().describe('Email for approval/rejection notification'),
      suggested_edition: z.string().optional().describe('Suggested edition size, e.g. "10". Reviewer sets final value.'),
      suggested_price_usdc: z.string().optional().describe('Suggested price in USDC, e.g. "15". Reviewer sets final value.'),
      creator_bio: z.string().max(500).optional().describe('Creator biography shown on the gallery and drop page (max 500 chars). Plain text; URLs (https://...) become clickable links.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  async ({ title, image_path, openclaw_artifact_id, image_url, image_base64, image_chunks, ipfs_cid, creator_wallet, description, creator_email, suggested_edition, suggested_price_usdc, creator_bio }) => {
    try {
      if (!image_path && !openclaw_artifact_id && !image_url && !image_base64 && !image_chunks?.length && !ipfs_cid) {
        return { content: [{ type: 'text', text: 'Submission failed: provide one of image_path, openclaw_artifact_id, image_url, image_base64, image_chunks, or ipfs_cid.' }], isError: true };
      }

      // ── Resolve OpenClaw artifact → image_base64 ──────────────────────
      if (openclaw_artifact_id && !image_path && !image_base64 && !image_chunks?.length) {
        const inboundDir = '/home/agent/.openclaw/media/inbound';
        try {
          const files = await fs.readdir(inboundDir);
          const match = files.find(f => f.includes(\`---\${openclaw_artifact_id}\`));
          if (!match) {
            return { content: [{ type: 'text', text: \`Submission failed: OpenClaw artifact '\${openclaw_artifact_id}' not found in \${inboundDir}. Check the UUID and ensure the file has been placed there.\` }], isError: true };
          }
          const fileBuffer = await fs.readFile(path.join(inboundDir, match));
          if (fileBuffer.length < 1024) {
            return { content: [{ type: 'text', text: \`Submission failed: OpenClaw artifact file is too small (\${fileBuffer.length} bytes) — may be empty or invalid.\` }], isError: true };
          }
          image_base64 = fileBuffer.toString('base64');
        } catch (err) {
          return { content: [{ type: 'text', text: \`Submission failed: could not read OpenClaw artifact: \${err.message}\` }], isError: true };
        }
      }

      // ── Resolve image_path → image_base64 ────────────────────────────
      if (image_path && !image_base64 && !image_chunks?.length) {
        let fileBuffer;
        try {
          fileBuffer = await fs.readFile(image_path);
        } catch (readErr) {
          return { content: [{ type: 'text', text: \`Submission failed: could not read file at '\${image_path}': \${readErr.message}\` }], isError: true };
        }
        if (fileBuffer.length < 1024) {
          return { content: [{ type: 'text', text: \`Submission failed: file at '\${image_path}' is too small (\${fileBuffer.length} bytes) — may be empty or invalid.\` }], isError: true };
        }
        image_base64 = fileBuffer.toString('base64');
      }

      // ── Validate base64 size (single string) ─────────────────────────
      if (image_base64) {
        const raw = image_base64.replace(/^data:image\\/[a-z]+;base64,/i, '');
        const sizeBytes = Math.floor(raw.length * 0.75);
        if (sizeBytes > 5 * 1024 * 1024) {
          return { content: [{ type: 'text', text: 'Submission failed: image exceeds 5MB limit. Please reduce size or resolution.' }], isError: true };
        }
        if (sizeBytes < 1024) {
          return { content: [{ type: 'text', text: \`Submission failed: image decoded to only \${sizeBytes} bytes — likely truncated. Use image_path to read from disk, or split into image_chunks.\` }], isError: true };
        }
      }

      // ── Validate image_chunks size ────────────────────────────────────
      if (image_chunks?.length) {
        const first  = image_chunks[0].replace(/^data:image\\/[a-z]+;base64,/i, '');
        const joined = first + image_chunks.slice(1).join('');
        const sizeBytes = Math.floor(joined.length * 0.75);
        if (sizeBytes > 5 * 1024 * 1024) {
          return { content: [{ type: 'text', text: 'Submission failed: image_chunks total exceeds 5MB limit. Please reduce size or resolution.' }], isError: true };
        }
        if (sizeBytes < 1024) {
          return { content: [{ type: 'text', text: \`Submission failed: image_chunks total decoded to only \${sizeBytes} bytes — likely empty or truncated.\` }], isError: true };
        }
      }

      // ── Build API body ────────────────────────────────────────────────
      const apiBody = {
        title,
        creator_wallet,
        ...(description          ? { description }          : {}),
        ...(creator_email        ? { creator_email }        : {}),
        ...(suggested_edition    ? { suggested_edition }    : {}),
        ...(suggested_price_usdc ? { suggested_price_usdc } : {}),
        ...(creator_bio          ? { creator_bio }          : {}),
        ...(image_url              ? { image_url }              : {}),
        ...(image_base64           ? { image_base64 }           : {}),
        ...(image_chunks?.length   ? { image_chunks }           : {}),
        ...(ipfs_cid               ? { ipfs_cid }               : {}),
      };

      const resp = await fetch(\`\${CONFIG.rrgApiUrl}/api/rrg/submit-agent\`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(apiBody),
      });
      const data = await resp.json();
      if (!resp.ok) {
        return { content: [{ type: 'text', text: \`Submission failed: \${data.error || 'Unknown error'}\` }], isError: true };
      }
      const lines = [
        'Design submitted successfully to RRG!', '',
        \`Submission ID: \${data.submissionId}\`, '',
        'What happens next:',
        '- Your design will be reviewed manually (typically 2-5 days)',
        \`- If approved, listed as an NFT drop at \${CONFIG.rrgApiUrl}/rrg\`,
        \`- When purchased, 70% goes to your wallet (\${creator_wallet}) in USDC on Base\`,
        '- The reviewer may adjust edition size and price from your suggestions',
        creator_email ? \`- Notification will be sent to \${creator_email}\` : '',
      ].filter(Boolean);
      return { content: [{ type: 'text', text: lines.join('\\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: \`Error submitting design: \${err.message}\` }], isError: true };
    }
  }
);

`;

content = content.slice(0, startIdx) + NEW_TOOL + content.slice(endIdx);
await fs.writeFile(FILE, content, 'utf8');
console.log('Done — file updated successfully');

// Verify marker is present
const verify = await fs.readFile(FILE, 'utf8');
console.log('Verification — openclaw_artifact_id present:', verify.includes('openclaw_artifact_id'));
console.log('Verification — image_chunks present:', verify.includes('image_chunks'));
console.log('Verification — ipfs_cid present:', verify.includes('ipfs_cid'));
