#!/usr/bin/env npx ts-node
/**
 * Agent Memory MCP Server
 *
 * Provides MCP access to the shared agent memory system.
 * Connects Claude Code (local) to the same memory used by
 * Omni Claude and Claudius on production.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools } from './tool-definitions';
import { handlers } from './handlers';

const server = new Server(
  { name: 'agent-memory', version: '3.0.0' },
  { capabilities: { tools: {} } }
);

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Agent Memory MCP server v3.0.0 running (graph + timeline + portraits + feedback + workflows + decisions + consensus + handoffs)');
}

main().catch((error) => { console.error('Fatal error:', error); process.exit(1); });
