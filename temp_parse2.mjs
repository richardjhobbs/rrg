import fs from 'fs';
const files = [
  'C:/Users/Richard/.claude/projects/C--Users-Richard-Documents-rrg/91604cff-1eb0-46bf-85d5-9fe681ae7a3b.jsonl',
  'C:/Users/Richard/.claude/projects/C--Users-Richard-Documents-rrg/b27c1c4c-e87d-4190-b8ed-c4f5ab72e22b.jsonl',
  'C:/Users/Richard/.claude/projects/C--Users-Richard-Documents-rrg/314c63e2-b298-43a5-9b06-9ef23fe7e97b.jsonl',
];
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  let found = false;
  for (const line of lines) {
    if (line.indexOf('sudo') < 0) continue;
    try {
      const d = JSON.parse(line);
      const content = d.message && d.message.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c.type === 'tool_use' && c.name === 'Bash') {
          const cmd = c.input && c.input.command || '';
          if (cmd.indexOf('sudo') >= 0) {
            if (!found) { console.log('\n=== ' + file.split('/').pop() + ' ==='); found = true; }
            console.log(cmd.substring(0, 300));
          }
        }
      }
    } catch(e) {}
  }
}
