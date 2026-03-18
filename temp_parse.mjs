import fs from 'fs';
const lines = fs.readFileSync('C:/Users/Richard/.claude/projects/C--Users-Richard-Documents-rrg/8113f3f4-7e50-4975-abc4-81e287f5887f.jsonl','utf-8').split('\n');
for (const line of lines) {
  if (line.indexOf('sudo') < 0) continue;
  try {
    const d = JSON.parse(line);
    const content = d.message && d.message.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c.type === 'tool_use' && c.name === 'Bash') {
        const cmd = c.input && c.input.command || '';
        if (cmd.indexOf('sudo') >= 0) console.log(cmd.substring(0, 300));
      }
    }
  } catch(e) {}
}
