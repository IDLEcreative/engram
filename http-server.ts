/**
 * Engram MCP HTTP Server
 *
 * Exposes the engram MCP server over HTTP with SSE transport.
 * This allows any Claude instance to connect, regardless of location.
 */

import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools } from './tool-definitions';
import { handlers } from './handlers';

const PORT = parseInt(process.env.ENGRAM_PORT || '3200', 10);
const API_KEY = process.env.ENGRAM_API_KEY || '';

if (!API_KEY) {
  console.error('ENGRAM_API_KEY environment variable is required');
  process.exit(1);
}

// Create MCP server
const server = new Server(
  { name: 'engram', version: '3.0.0' },
  { capabilities: { tools: {} } }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = handlers[name];

  if (!handler) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }

  try {
    return await handler(args);
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown'}` }],
      isError: true,
    };
  }
});

// Track active transports
const transports = new Map<string, SSEServerTransport>();

// Create HTTP server
const httpServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'engram-mcp', version: '3.0.0' }));
    return;
  }

  const authHeader = req.headers.authorization;
  const providedKey = authHeader?.replace('Bearer ', '');

  if (providedKey !== API_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  if (req.url === '/mcp' || req.url?.startsWith('/mcp?')) {
    const transport = new SSEServerTransport('/mcp', res);
    const sessionId = crypto.randomUUID();

    transports.set(sessionId, transport);

    res.on('close', () => {
      transports.delete(sessionId);
      console.log(`[engram-http] Session closed: ${sessionId}`);
    });

    console.log(`[engram-http] New session: ${sessionId}`);
    await server.connect(transport);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[engram-http] Engram MCP HTTP server listening on port ${PORT}`);
  console.log(`[engram-http] Connect via: http://localhost:${PORT}/mcp`);
  console.log(`[engram-http] Health check: http://localhost:${PORT}/health`);
});

process.on('SIGTERM', () => {
  console.log('[engram-http] Shutting down...');
  httpServer.close();
  process.exit(0);
});
