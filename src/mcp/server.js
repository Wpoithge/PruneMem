import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

import * as archiveSession from './tools/archive-session.js';
import * as runtimeContext from './tools/runtime-context.js';
import * as executionPlan from './tools/execution-plan.js';
import * as getWorkingState from './tools/get-working-state.js';
import * as validateMaintenance from './tools/validate-maintenance.js';
import * as repairSourcePaths from './tools/repair-source-paths.js';
import * as updateWorkingState from './tools/update-working-state.js';
import * as curatorApply from './tools/curator-apply.js';
import * as updateRegistries from './tools/update-registries.js';
import { validateArgs } from './shared/validate.js';

const TOOLS = [archiveSession, runtimeContext, executionPlan, getWorkingState, validateMaintenance, repairSourcePaths, updateWorkingState, curatorApply, updateRegistries];

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

    validateArgs(args, tool.inputSchema, tool.name);

    return await tool.handler(args);
  });

  return server;
}

export async function startServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
