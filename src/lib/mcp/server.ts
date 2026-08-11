import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { DriveAdapter } from './driveAdapter';
import { GitHubAdapter } from './githubAdapter';
import { isTokenExpired, sendExpirationEmail } from './authGuard';
import { getUserConfigFromFirestore, clearGoogleToken, clearGithubToken } from '../firebaseStore';

export interface ContextPayload {
  metadata: {
    version: number;
    last_updated: string;
    [key: string]: any;
  };
  working_memory: Record<string, any>;
  tasks: any[];
  [key: string]: any;
}

// In-memory session store map
const sessionStore = new Map<string, ContextPayload>();

function resolveUserId(args: any, boundUserId?: string): string {
  const fromArgs = args?.user_id as string | undefined;
  const uid = boundUserId || fromArgs;
  if (!uid) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'user_id is required (or connect via an MCP link that is bound to your account).'
    );
  }
  return uid;
}

function createDriveAdapterFromConfig(userConfig: {
  googleAccessToken?: string;
  googleRefreshToken?: string;
}): DriveAdapter {
  // Prefer refresh_token when available (long-lived); otherwise use access_token
  if (userConfig.googleRefreshToken) {
    return new DriveAdapter(userConfig.googleRefreshToken, { isRefreshToken: true });
  }
  if (userConfig.googleAccessToken) {
    return new DriveAdapter(userConfig.googleAccessToken);
  }
  throw new McpError(ErrorCode.InvalidParams, 'User Google Drive configuration not found.');
}

export function createServerInstance(boundUserId?: string) {
  const server = new Server(
    {
      name: 'ai-to-ai-context-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'get_context',
          description: 'Retrieves the current shared context payload',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Unique identifier for the session' },
            },
            required: ['session_id'],
          },
        },
        {
          name: 'update_context',
          description: 'Patches working memory, tasks, or shared state with optimistic locking',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Unique identifier for the session' },
              patch_data: { type: 'object', description: 'Partial context payload to merge into existing state' },
              expected_version: { type: 'number', description: 'The current known version number to prevent race conditions' },
            },
            required: ['session_id', 'patch_data', 'expected_version'],
          },
        },
        {
          name: 'sync_to_drive',
          description: 'Persists session state to Google Drive appDataFolder. user_id is optional when connected via MCP link.',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Unique identifier for the session' },
              user_id: { type: 'string', description: 'Optional if MCP link is bound to a user' }
            },
            required: ['session_id'],
          },
        },
        {
          name: 'sync_to_github',
          description: 'Commits session state or repository files to GitHub. user_id is optional when connected via MCP link.',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Unique identifier for the session' },
              user_id: { type: 'string', description: 'Optional if MCP link is bound to a user' },
              commit_message: { type: 'string', description: 'Commit message for the update' },
              filePath: { type: 'string', description: 'Optional file path within the repository (defaults to .context/session_id.json)' },
            },
            required: ['session_id', 'commit_message'],
          },
        },
        {
          name: 'read_index',
          description: 'Reads the index.md file from Google Drive appDataFolder',
          inputSchema: {
            type: 'object',
            properties: { user_id: { type: 'string', description: 'Optional if MCP link is bound to a user' } },
            required: [],
          },
        },
        {
          name: 'read_notice',
          description: 'Reads the notice.md file from Google Drive appDataFolder',
          inputSchema: {
            type: 'object',
            properties: { user_id: { type: 'string', description: 'Optional if MCP link is bound to a user' } },
            required: [],
          },
        },
        {
          name: 'append_commit',
          description: 'Appends a new record row to commit.md in Google Drive appDataFolder',
          inputSchema: {
            type: 'object',
            properties: {
              user_id: { type: 'string', description: 'Optional if MCP link is bound to a user' },
              name: { type: 'string' },
              type: { type: 'string' },
              size: { type: 'string' },
              summary: { type: 'string' }
            },
            required: ['name', 'type', 'size', 'summary'],
          },
        }
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      switch (name) {
      case 'get_context': {
        const { session_id } = args as { session_id: string };
        if (!session_id) {
          throw new McpError(ErrorCode.InvalidParams, 'session_id is required');
        }
        
        let payload = sessionStore.get(session_id);
        
        if (!payload) {
          payload = {
            metadata: {
              version: 1,
              last_updated: new Date().toISOString(),
            },
            working_memory: {},
            tasks: [],
          };
          sessionStore.set(session_id, payload);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      }
      
      case 'update_context': {
        const { session_id, patch_data, expected_version } = args as { session_id: string; patch_data: any; expected_version: number };
        
        const payload = sessionStore.get(session_id);
        if (!payload) {
          throw new McpError(ErrorCode.InvalidParams, `Session ${session_id} not found in memory. Please call get_context first to initialize.`);
        }
        
        if (payload.metadata.version !== expected_version) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Version mismatch for session ${session_id}. Expected version ${payload.metadata.version}, but got ${expected_version}. Another process may have updated the context. Please get_context and retry.`
          );
        }
        
        const updatedPayload: ContextPayload = {
          ...payload,
          ...patch_data,
          metadata: {
            ...payload.metadata,
            ...(patch_data?.metadata || {}),
            version: payload.metadata.version + 1,
            last_updated: new Date().toISOString(),
          }
        };
        
        sessionStore.set(session_id, updatedPayload);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(updatedPayload, null, 2),
            },
          ],
        };
      }
      
      case 'sync_to_drive': {
        const { session_id } = args as { session_id: string; user_id?: string };
        const user_id = resolveUserId(args, boundUserId);
        const userConfig = await getUserConfigFromFirestore(user_id);
        
        if (!userConfig || (!userConfig.googleAccessToken && !userConfig.googleRefreshToken)) {
          throw new McpError(ErrorCode.InvalidParams, 'User Google Drive configuration not found. Sign in with Google in the web UI first.');
        }
        
        if (
          userConfig.googleAccessToken &&
          isTokenExpired({ accessToken: userConfig.googleAccessToken, expiresAt: userConfig.googleTokenExpiresAt }) &&
          !userConfig.googleRefreshToken
        ) {
          await clearGoogleToken(user_id);
          if (userConfig.email) await sendExpirationEmail(userConfig.email).catch(console.error);
          throw new McpError(ErrorCode.InvalidRequest, 'your token is expired you need to re-login');
        }
        
        const payload = sessionStore.get(session_id);
        if (!payload) {
          throw new McpError(ErrorCode.InvalidParams, `Session ${session_id} not found in memory. Cannot sync.`);
        }
        
        const driveAdapter = createDriveAdapterFromConfig(userConfig);
        const fileId = await driveAdapter.save_to_appdata(session_id, payload);
        
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Successfully synced to Drive appDataFolder`, fileId }) }]
        };
      }
      
      case 'sync_to_github': {
        const { session_id, commit_message, filePath } = args as { 
          session_id: string; user_id?: string; commit_message: string; filePath?: string;
        };
        const user_id = resolveUserId(args, boundUserId);
        const userConfig = await getUserConfigFromFirestore(user_id);
        
        if (!userConfig || !userConfig.githubToken || !userConfig.githubRepo) {
          throw new McpError(ErrorCode.InvalidParams, 'User GitHub configuration not found.');
        }
        
        if (isTokenExpired({ accessToken: userConfig.githubToken, expiresAt: userConfig.githubTokenExpiresAt })) {
          await clearGithubToken(user_id);
          throw new McpError(ErrorCode.InvalidRequest, 'your token is expired you need to re-login');
        }
        
        const payload = sessionStore.get(session_id);
        if (!payload) {
          throw new McpError(ErrorCode.InvalidParams, `Session ${session_id} not found in memory. Cannot sync.`);
        }
        
        const owner = userConfig.githubUsername || userConfig.githubRepo.split('/')[0];
        const repo = userConfig.githubRepo.split('/').pop() || '';
        
        const githubAdapter = new GitHubAdapter(userConfig.githubToken, owner, repo);
        const sha = await githubAdapter.sync_context_to_repo(session_id, payload, commit_message, filePath);
        
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Successfully synced to GitHub repository`, sha }) }]
        };
      }

      case 'read_index':
      case 'read_notice': {
        const user_id = resolveUserId(args, boundUserId);
        const userConfig = await getUserConfigFromFirestore(user_id);
        
        if (!userConfig || (!userConfig.googleAccessToken && !userConfig.googleRefreshToken)) {
          throw new McpError(ErrorCode.InvalidParams, 'User Google Drive configuration not found.');
        }
        if (
          userConfig.googleAccessToken &&
          isTokenExpired({ accessToken: userConfig.googleAccessToken, expiresAt: userConfig.googleTokenExpiresAt }) &&
          !userConfig.googleRefreshToken
        ) {
          await clearGoogleToken(user_id);
          if (userConfig.email) await sendExpirationEmail(userConfig.email).catch(console.error);
          throw new McpError(ErrorCode.InvalidRequest, 'your token is expired you need to re-login');
        }
        
        const driveAdapter = createDriveAdapterFromConfig(userConfig);
        const fileName = name === 'read_index' ? 'index.md' : 'notice.md';
        const fileContent = await driveAdapter.read_file_as_text(fileName);
        
        return {
          content: [{ type: 'text', text: fileContent || `(File ${fileName} is empty or not found)` }]
        };
      }

      case 'append_commit': {
        const { name: rowName, type, size, summary } = args as { 
          user_id?: string; name: string; type: string; size: string; summary: string; 
        };
        const user_id = resolveUserId(args, boundUserId);
        const userConfig = await getUserConfigFromFirestore(user_id);
        
        if (!userConfig || (!userConfig.googleAccessToken && !userConfig.googleRefreshToken)) {
          throw new McpError(ErrorCode.InvalidParams, 'User Google Drive configuration not found.');
        }
        if (
          userConfig.googleAccessToken &&
          isTokenExpired({ accessToken: userConfig.googleAccessToken, expiresAt: userConfig.googleTokenExpiresAt }) &&
          !userConfig.googleRefreshToken
        ) {
          await clearGoogleToken(user_id);
          if (userConfig.email) await sendExpirationEmail(userConfig.email).catch(console.error);
          throw new McpError(ErrorCode.InvalidRequest, 'your token is expired you need to re-login');
        }
        
        const driveAdapter = createDriveAdapterFromConfig(userConfig);
        
        const now = new Date();
        const last_used = now.toISOString();
        const time_stamp_created = now.getTime().toString();
        const dateStr = now.toISOString().split('T')[0];
        
        const row = `| ${rowName} | ${type} | ${size} | ${last_used} | ${time_stamp_created} | ${dateStr} | ${summary} |\n`;
        
        let existingContent = await driveAdapter.read_file_as_text('commit.md') || 
          '| Name | Type | Size | Last Used | Timestamp Created | Date | Summary |\n|---|---|---|---|---|---|---|\n';
        
        existingContent += row;
        
        await driveAdapter.write_file_as_text('commit.md', existingContent);
        
        return {
          content: [{ type: 'text', text: `Successfully appended commit to commit.md` }]
        };
      }
      
      default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error: any) {
      if (error instanceof McpError) {
        throw error;
      }
      
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: error.message || String(error),
          },
        ],
      };
    }
  });

  return server;
}

// Only start stdio if executed directly (not imported)
if (process.argv[1]?.includes('mcp/server.ts') || process.argv.includes('--stdio')) {
  async function run() {
    const server = createServerInstance();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('AI-to-AI Context MCP Server running on stdio');
  }

  run().catch((error) => {
    console.error('Fatal error in main:', error);
    process.exit(1);
  });
}
