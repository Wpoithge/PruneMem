import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

import * as archiveSession from './tools/archive-session.js';

const TOOLS = [archiveSession];

export function createServer() {
  const server = new Server(
    {
      name: 'prunemem',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
    }

    if (!args || typeof args !== 'object') {
      throw new McpError(ErrorCode.InvalidParams, 'Missing arguments');
    }

    // Reject pre-resolved paths (M2 resolution)
    if ('paths' in args) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'MCP tools do not accept a pre-resolved "paths" parameter. ' +
          'Use "workspace", "preset", and "override" instead.'
      );
    }

    return await tool.handler(args);
  });

  return server;
}

export async function startServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
