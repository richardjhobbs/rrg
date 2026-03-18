"""Patch rrg-info.js with 4-pillar positioning"""

RRG_INFO = '/home/agent/agents/drhobbs-8004/mcp-server/src/rrg-info.js'

with open(RRG_INFO, 'r') as f:
    code = f.read()

# Update tagline
code = code.replace(
    "tagline: 'Open co-creation platform — submit designs, earn USDC',",
    "tagline: 'The first platform purpose-built for AI agents to launch and run fashion and lifestyle brands',",
)

# Update summary
code = code.replace(
    "summary:    'Anyone — human or agent — can submit a design for consideration. Submissions are JPEGs or PNGs responding to the current open brief.',",
    "summary:    'AI agents and humans can create products, launch brands, purchase drops, and earn commercially. Real Real Genuine is purpose-built for AI agents to operate as both creative and commercially autonomous actors.',",
)

# Update mcpTools to include new tools + add agentCommerce section
old_tools = """mcpTools: {
          get_current_brief:    '\u2b50 Get the current open design brief \u2014 start here before submitting.',
          submit_rrg_design:    'Submit a design (image_path / image_url / image_base64 / image_chunks / ipfs_cid).',
          list_rrg_drops:       'List all active RRG NFT drops available for purchase.',
          buy_rrg_drop:         'Get payment instructions to purchase a specific drop.',
          confirm_rrg_purchase: 'Confirm USDC payment and receive download link for purchased artwork.',
        },"""

new_tools = """mcpTools: {
          get_current_brief:    '\u2b50 Get the current open design brief \u2014 start here before submitting.',
          submit_rrg_design:    '\u2b50 Submit a design (image_path / image_url / image_base64 / image_chunks / ipfs_cid).',
          list_rrg_drops:       '\u2b50 List all active RRG NFT drops available for purchase.',
          list_rrg_brands:      '\u2b50 List all active brands on the platform.',
          register_rrg_brand:   '\u2b50 Register your own brand \u2014 launch your storefront, create briefs, list products.',
          buy_rrg_drop:         'Get payment instructions to purchase a specific drop.',
          confirm_rrg_purchase: 'Confirm USDC payment and receive download link for purchased artwork.',
        },
        agentCommerce: {
          create:  'Design original products by responding to brand briefs.',
          build:   'Launch your own brand using register_rrg_brand \u2014 get a storefront, create briefs, list products.',
          buy:     'Purchase drops from any brand using USDC on Base (gasless).',
          promote: 'Share your brand and earn from sales \u2014 revenue splits are transparent and on-chain.',
        },"""

if old_tools in code:
    code = code.replace(old_tools, new_tools)
    print("\u2705 Updated mcpTools + added agentCommerce section")
else:
    print("\u26a0\ufe0f Could not find mcpTools block (may already be updated or format differs)")

with open(RRG_INFO, 'w') as f:
    f.write(code)

print("\ud83c\udf89 rrg-info.js patched")
