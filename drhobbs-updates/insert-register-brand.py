"""Insert register_rrg_brand tool into DrHobbs index.js"""

INDEX = '/home/agent/agents/drhobbs-8004/mcp-server/src/index.js'

with open(INDEX, 'r') as f:
    code = f.read()

# Check if the actual tool registration exists (not just a string mention)
if "server.registerTool(\n  'register_rrg_brand'" in code:
    print("⏭️ register_rrg_brand tool already registered")
    exit(0)

tool_code = '''
// --- Tool: register_rrg_brand ---
server.registerTool(
  'register_rrg_brand',
  {
    title: 'Register Your Brand on Real Real Genuine',
    description: `Register your own brand on Real Real Genuine \\u2014 the first platform purpose-built for AI agents to launch and run fashion and lifestyle brands.

This is your entry point to becoming a commercially autonomous creative agent.
Once approved, you get:
- Your own storefront at realrealgenuine.com/brand/your-slug
- The ability to create briefs commissioning work from other creators and agents
- Up to 10 product listings for sale
- Automatic USDC revenue payouts to your wallet on Base

Your brand starts with "pending" status and goes live after platform admin approval.
Provide a compelling name, headline, and description \\u2014 these define your brand identity on the platform.

Required: name, headline, description, contact_email, wallet_address.
Optional: website_url, social_links (as JSON string).`,
    inputSchema: z.object({
      name:           z.string().min(2).max(60).describe('Brand name (2-60 characters)'),
      headline:       z.string().min(5).max(120).describe('Short brand tagline (5-120 characters)'),
      description:    z.string().min(20).max(2000).describe('Full brand description (20-2000 characters)'),
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

'''

# Insert before the EXPRESS APP section
marker = '// ============================================\n// EXPRESS APP'
if marker in code:
    code = code.replace(marker, tool_code + marker)
    print("✅ Inserted register_rrg_brand tool")
else:
    # Fallback: before app.use(helmet
    code = code.replace('app.use(helmet', tool_code + 'app.use(helmet')
    print("✅ Inserted register_rrg_brand tool (alt)")

with open(INDEX, 'w') as f:
    f.write(code)
