// ============================================
// RRG MCP Client — calls RRG MCP tools via HTTP
// ============================================
// DrHobbs uses this to proxy tool calls to the RRG MCP server
// running on localhost:3001. This keeps DrHobbs in sync with
// any new tools or changes on the RRG platform automatically.

const RRG_MCP_URL = process.env.RRG_MCP_URL || 'http://127.0.0.1:3001/mcp';

/**
 * Call an RRG MCP tool by name with arguments.
 * Handles the full MCP protocol: initialize → tools/call
 * @param {string} toolName - e.g. 'register_brand', 'list_brands'
 * @param {object} args - tool arguments
 * @returns {object} - { content, isError }
 */
export async function callRRGTool(toolName, args = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };

  // Step 1: Initialize (stateless — required per request)
  const initResp = await fetch(RRG_MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'drhobbs', version: '2.0' },
      },
    }),
    signal: AbortSignal.timeout(10000),
  });

  // Extract session ID from response header if present
  const sessionId = initResp.headers.get('mcp-session-id');
  const callHeaders = { ...headers };
  if (sessionId) callHeaders['mcp-session-id'] = sessionId;

  // Parse SSE init response (just to confirm success)
  const initRaw = await initResp.text();
  const initDataLine = initRaw.split('\n').find(l => l.startsWith('data:'));
  if (!initDataLine) throw new Error('RRG MCP init failed: no data in response');

  // Step 2: Send initialized notification
  await fetch(RRG_MCP_URL, {
    method: 'POST',
    headers: callHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'notifications/initialized',
    }),
    signal: AbortSignal.timeout(5000),
  });

  // Step 3: Call the tool
  const callResp = await fetch(RRG_MCP_URL, {
    method: 'POST',
    headers: callHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(30000),
  });

  const callRaw = await callResp.text();
  const callDataLine = callRaw.split('\n').find(l => l.startsWith('data:'));
  if (!callDataLine) throw new Error(`RRG MCP tool call failed: no data in response`);

  const callParsed = JSON.parse(callDataLine.slice(5));
  if (callParsed.error) {
    throw new Error(callParsed.error.message || JSON.stringify(callParsed.error));
  }

  return callParsed.result;
}

/**
 * Fetch RRG MCP server instructions (from initialize response).
 * Used at startup to sync instructions.
 * @returns {string} instructions text
 */
export async function fetchRRGInstructions() {
  const resp = await fetch(RRG_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'drhobbs-sync', version: '2.0' },
      },
    }),
    signal: AbortSignal.timeout(5000),
  });

  const raw = await resp.text();
  const dataLine = raw.split('\n').find(l => l.startsWith('data:'));
  if (!dataLine) return null;

  const parsed = JSON.parse(dataLine.slice(5));
  return parsed.result?.instructions || null;
}
