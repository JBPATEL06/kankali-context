import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { ElectronPlatformAdapter, CloudPlatformAdapter, PlatformAdapter } from '../../../platform';
import { getBookStyleToolDefinitions, handleBookStyleToolCall } from './tools/bookStyleTools';
export type { ContextPayload } from './types';

const platform: PlatformAdapter = process.env.KANKALI_TEST === "true" || process.env.NODE_ENV !== "production" 
  ? new ElectronPlatformAdapter() 
  : new CloudPlatformAdapter();

/**
 * Factory creating an MCP server instance with all Book-Style tools registered.
 */
export function createServerInstance(boundUserId?: string) {
  const server = new Server(
    {
      name: 'kankali-book-style-mcp',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools list
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: getBookStyleToolDefinitions(),
    };
  });

  // Handle tool execution requests
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const userId = boundUserId || (args?.user_id as string) || 'local-user';

    let userConfig: any = {};
    try {
      userConfig = await platform.getUserStore().getUserConfig(userId);
    } catch (e) {
      // ignore
    }

    try {
      return await handleBookStyleToolCall(name, args, {
        userId,
        userConfig,
        platform,
      });
    } catch (error: any) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InternalError, error.message || String(error));
    }
  });

  return server;
}

async function run() {
  const serverInstance = createServerInstance();
  const transport = new StdioServerTransport();
  await serverInstance.connect(transport);
  console.error('Kankali Book-Style Context MCP Server running on stdio');
}

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  run().catch((error) => {
    console.error('Fatal error in main:', error);
    process.exit(1);
  });
}
