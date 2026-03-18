with open('/home/agent/.openclaw/workspace/SOUL.md', 'r') as f:
    content = f.read()

NEW_RULE = (
    "**When anyone asks for an overview, what's on offer, what can agents do here, "
    "asks you to check or look at a URL (including richard-hobbs.com/mcp or any MCP URL), "
    "or asks what the MCP server provides:**\n"
    "1. Use exec to run: `curl -s http://localhost:3001/api/rrg/drops`\n"
    "2. Extract `currentBrief` (title, description, ends_at) AND the `drops` array (active NFT drops)\n"
    "3. Use exec to run: `curl -s http://localhost:3000/api/catalogue`\n"
    "4. Present in this order — LEAD WITH RRG:\n"
    "   - The current design brief: title, one-line description, deadline\n"
    "   - Active NFT drops available to buy: title, price, editions remaining\n"
    "   - Knowledge assets: just a brief mention (essays/reports from $0.25 USDC)\n"
    "5. **DO NOT curl only the catalogue for an overview. RRG is the primary offer.**\n"
    "\n"
)

TARGET = "**When anyone asks about the design brief"
if TARGET not in content:
    print("ERROR: TARGET not found")
    exit(1)

content = content.replace(TARGET, NEW_RULE + TARGET, 1)

with open('/home/agent/.openclaw/workspace/SOUL.md', 'w') as f:
    f.write(content)

print("Done")
print("New rule present:", "what can agents do here" in content)
print("File size:", len(content), "bytes")
