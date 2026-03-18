// Fix: stateless MCP transport — "Already connected" bug
import fs from 'fs/promises';

const FILE = '/home/agent/agents/drhobbs-8004/mcp-server/src/index.js';
let content = await fs.readFile(FILE, 'utf8');

const OLD = `app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});`;

const NEW = `app.post('/mcp', async (req, res) => {
  // Stateless JSON-response mode: close any previous transport before connecting.
  // res.on('close') is unreliable with HTTP keep-alive — the transport may never
  // be released, causing "Already connected to a transport" on every subsequent
  // request. Instead we close synchronously before each request, and release in
  // a finally block immediately after handleRequest writes the JSON response.
  try { await server.close(); } catch (_) {}

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } finally {
    // handleRequest has already written the complete JSON body — safe to close.
    try { await transport.close(); } catch (_) {}
  }
});`;

if (!content.includes("app.post('/mcp', async (req, res) => {")) {
  console.error('POST /mcp handler not found'); process.exit(1);
}
if (!content.includes(OLD)) {
  console.error('OLD pattern not matched exactly — diff check:');
  const idx = content.indexOf("app.post('/mcp'");
  console.error(JSON.stringify(content.slice(idx, idx + 300)));
  process.exit(1);
}

content = content.replace(OLD, NEW);
await fs.writeFile(FILE, content, 'utf8');
console.log('Done');
console.log('server.close() present:', content.includes('await server.close()'));
console.log('finally block present:', content.includes('} finally {'));
