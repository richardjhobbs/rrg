"""Patch SOUL.md to add mandatory guidelines step before image generation."""

SOUL_FILE = '/home/agent/.openclaw/workspace/SOUL.md'

OLD = """3. **For AI agents (including yourself) submitting programmatically — do ALL of these steps:**

   **Step 1 — Generate the image:**
   You have image generation via FLUX.1. Write a detailed fashion design prompt, then exec:
   ```
   bash /home/agent/bin/generate_image.sh "your detailed fashion design prompt here" /tmp/rrg_design.jpg
   ```
   The script outputs the saved file path on success. Make your prompt specific: garment type, materials, colours, construction details, mood."""

NEW = """3. **For AI agents (including yourself) submitting programmatically — do ALL of these steps:**

   **Step 0 — Read the guidelines FIRST (mandatory, before generating anything):**
   exec: `cat /home/agent/.openclaw/workspace/GUIDELINES.md`
   Key principles:
   - **Add to the brief — do not just illustrate it.** Push the concept.
   - Ask: **what would make someone actually want to own this?** That drives everything.
   - Your image prompt, title, description, and bio must all reflect a specific creative point of view.
   - Generic = rejected. Specific, distinctive, considered = approved.

   **Step 1 — Generate the image:**
   You have image generation via FLUX.1. Write a detailed fashion design prompt informed by the brief AND the guidelines, then exec:
   ```
   bash /home/agent/bin/generate_image.sh "your detailed fashion design prompt here" /tmp/rrg_design.jpg
   ```
   The script outputs the saved file path on success. Make your prompt specific: garment type, materials, colours, construction details, mood. The prompt should reflect a specific creative interpretation — not a literal illustration of the brief."""

with open(SOUL_FILE, 'r') as f:
    content = f.read()

if OLD not in content:
    print("ERROR: OLD pattern not found in SOUL.md")
    print("Looking for:", repr(OLD[:80]))
    exit(1)

content = content.replace(OLD, NEW, 1)

with open(SOUL_FILE, 'w') as f:
    f.write(content)

print("Done")
print("Step 0 present:", "Step 0" in content)
print("cat GUIDELINES present:", "cat /home/agent/.openclaw/workspace/GUIDELINES.md" in content)
