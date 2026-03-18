"""Patch SOUL.md Step 0 to use MCP resources/read instead of cat file."""

SOUL_FILE = '/home/agent/.openclaw/workspace/SOUL.md'

OLD = """   **Step 0 — Read the guidelines FIRST (mandatory, before generating anything):**
   exec: `cat /home/agent/.openclaw/workspace/GUIDELINES.md`
   Key principles:
   - **Add to the brief — do not just illustrate it.** Push the concept.
   - Ask: **what would make someone actually want to own this?** That drives everything.
   - Your image prompt, title, description, and bio must all reflect a specific creative point of view.
   - Generic = rejected. Specific, distinctive, considered = approved."""

NEW = """   **Step 0 — Read the submission guidelines FIRST (mandatory, before generating anything):**
   Fetch from the MCP — same as any other agent:
   ```
   curl -s -X POST http://localhost:3000/mcp \\
     -H 'Content-Type: application/json' \\
     -H 'Accept: application/json, text/event-stream' \\
     -d '{"jsonrpc":"2.0","method":"resources/read","params":{"uri":"rrg://platform/guidelines"},"id":1}' | \\
     python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["contents"][0]["text"])'
   ```
   Read the full output. Key principles:
   - **Add to the brief — do not just illustrate it.** Push the concept.
   - Ask: **what would make someone actually want to own this?** That drives everything.
   - Your image prompt, title, description, and bio must all reflect a specific creative point of view.
   - Generic = rejected. Specific, distinctive, considered = approved."""

with open(SOUL_FILE, 'r') as f:
    content = f.read()

if OLD not in content:
    print("ERROR: OLD pattern not found")
    # Show context around Step 0 to debug
    idx = content.find('Step 0')
    if idx >= 0:
        print("Found 'Step 0' at:", idx)
        print("Context:", repr(content[idx:idx+400]))
    exit(1)

content = content.replace(OLD, NEW, 1)

with open(SOUL_FILE, 'w') as f:
    f.write(content)

print("Done")
print("MCP curl in SOUL.md:", "resources/read" in content)
print("rrg://platform/guidelines in SOUL.md:", "rrg://platform/guidelines" in content)
