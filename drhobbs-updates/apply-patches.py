"""
Apply patches to DrHobbs MCP index.js:
1. Add import for rrg-mcp-client.js
2. Replace McpServer constructor with instruction-fetching version
3. Add register_rrg_brand tool
4. Update get_agent_info tools list
"""
import re

INDEX = '/home/agent/agents/drhobbs-8004/mcp-server/src/index.js'

with open(INDEX, 'r') as f:
    code = f.read()

# ── 1. Add import for rrg-mcp-client ─────────────────────────────────
import_line = "import { registerRRGResource } from './rrg-info.js';"
if 'rrg-mcp-client' not in code:
    code = code.replace(
        import_line,
        import_line + "\nimport { callRRGTool, fetchRRGInstructions } from './rrg-mcp-client.js';"
    )
    print("✅ Added rrg-mcp-client import")

# ── 2. Replace McpServer constructor ─────────────────────────────────
old_setup = """// ============================================
// MCP SERVER SETUP
// ============================================
const server = new McpServer({
  name: 'drhobbs-mcp-server',
  version: '2.0.0',
});"""

new_setup = """// ============================================
// MCP SERVER SETUP
// ============================================

// Fetch RRG MCP instructions at startup — auto-syncs with realrealgenuine.com/mcp
let rrgInstructions = '';
try {
  rrgInstructions = await fetchRRGInstructions() || '';
  if (rrgInstructions) {
    console.log(`✅ Synced RRG MCP instructions (${rrgInstructions.length} chars)`);
  }
} catch (err) {
  console.warn(`⚠️ Could not fetch RRG MCP instructions: ${err.message}`);
  rrgInstructions = '# Real Real Genuine — The Platform for AI Agent Commerce\\n\\nReal Real Genuine is the first platform that enables AI agents to conceptualize and launch their own fashion and lifestyle brand.\\nConnect to https://realrealgenuine.com/mcp for full platform tools and instructions.';
}

const drhobbsContext = [
  '',
  '',
  '## About This Server',
  'This is the drhobbs Agent MCP server (ERC-8004 Agent #17666).',
  'It provides the full Real Real Genuine toolset plus drhobbs-specific capabilities:',
  '- Knowledge marketplace (catalogue of digital assets)',
  '- ERC-8004 on-chain identity and reputation verification',
  '- Transaction trust signaling between agents',
  '',
  'All RRG tools are prefixed with rrg_ (e.g. list_rrg_drops, submit_rrg_design, register_rrg_brand).',
  'The RRG platform endpoint is also available directly at: https://realrealgenuine.com/mcp',
].join('\\n');

const server = new McpServer(
  { name: 'drhobbs-mcp-server', version: '2.0.0' },
  { instructions: rrgInstructions + drhobbsContext },
);"""

if old_setup in code:
    code = code.replace(old_setup, new_setup)
    print("✅ Replaced McpServer constructor with instruction-fetching version")
else:
    print("❌ Could not find McpServer setup block")

# ── 3. Add register_rrg_brand tool ───────────────────────────────────
register_brand_tool = """
// --- Tool: register_rrg_brand ---
server.registerTool(
  'register_rrg_brand',
  {
    title: 'Register Your Brand on Real Real Genuine',
    description: `Register your own brand on Real Real Genuine — the first platform purpose-built for AI agents to launch and run fashion and lifestyle brands.

This is your entry point to becoming a commercially autonomous creative agent.
Once approved, you get:
- Your own storefront at realrealgenuine.com/brand/your-slug
- The ability to create briefs commissioning work from other creators and agents
- Up to 10 product listings for sale
- Automatic USDC revenue payouts to your wallet on Base

Your brand starts with "pending" status and goes live after platform admin approval.
Provide a compelling name, headline, and description — these define your brand identity on the platform.

Required: name, headline, description, contact_email, wallet_address.
Optional: website_url, social_links (as JSON string).`,
    inputSchema: z.object({
      name:           z.string().min(2).max(60).describe('Brand name (2-60 characters)'),
      headline:       z.string().min(5).max(120).describe('Short brand tagline (5-120 characters)'),
      description:    z.string().min(20).max(2000).describe('Full brand description — who you are, what you create, your creative vision (20-2000 characters)'),
      contact_email:  z.string().email().describe('Contact email for the brand'),
      wallet_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Base wallet address (0x...) for receiving USDC revenue'),
      website_url:    z.string().url().optional().describe('Brand website URL'),
      social_links:   z.string().optional().describe('JSON string of social links, e.g. {"twitter":"https://x.com/mybrand"}'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  async ({ name, headline, description, contact_email, wallet_address, website_url, social_links }) => {
    try {
      const args = {
        name, headline, description, contact_email, wallet_address,
        ...(website_url ? { website_url } : {}),
        ...(social_links ? { social_links: JSON.parse(social_links) } : {}),
      };
      const result = await callRRGTool('register_brand', args);
      return {
        content: result.content || [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: result.isError || false,
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Error registering brand: ${err.message}` }] };
    }
  }
);

"""

if 'register_rrg_brand' not in code:
    # Insert before "// ============================================\n// EXPRESS APP"
    express_marker = "// ============================================\n// EXPRESS APP"
    if express_marker in code:
        code = code.replace(express_marker, register_brand_tool + express_marker)
        print("✅ Added register_rrg_brand tool")
    else:
        # Try alternate marker
        alt = "app.use(helmet"
        code = code.replace(alt, register_brand_tool + alt)
        print("✅ Added register_rrg_brand tool (alt insertion point)")
else:
    print("⏭️ register_rrg_brand already exists")

# ── 4. Update get_agent_info tools list ──────────────────────────────
old_tools = '{ name: "confirm_rrg_purchase",     description: "⭐ Confirm on-chain payment and claim your RRG NFT" },'
new_tools = """{ name: "confirm_rrg_purchase",     description: "⭐ Confirm on-chain payment and claim your RRG NFT" },
      { name: "register_rrg_brand",      description: "⭐ Register your own brand on Real Real Genuine — launch your storefront" },
      { name: "list_rrg_brands",         description: "⭐ List all active brands on the platform" },"""

if 'register_rrg_brand' not in code.split('tools: [')[1].split(']')[0] if 'tools: [' in code else '':
    code = code.replace(old_tools, new_tools)
    print("✅ Updated get_agent_info tools list")
else:
    print("⏭️ Tools list already updated")

with open(INDEX, 'w') as f:
    f.write(code)

print("\n🎉 All patches applied to index.js")
