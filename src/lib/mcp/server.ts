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
import { ElectronPlatformAdapter, CloudPlatformAdapter, PlatformAdapter } from '../../../platform';

const platform: PlatformAdapter = process.env.KANKALI_TEST === "true" || process.env.NODE_ENV !== "production" 
  ? new ElectronPlatformAdapter() 
  : new CloudPlatformAdapter();

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

const sessionStore = new Map<string, ContextPayload>();

async function clearGoogleToken(userId?: string) {
  if (!userId || userId === 'local-user' || userId === 'guest') return;
  try {
    const config = await platform.getUserStore().getUserConfig(userId);
    (config as any).googleRefreshToken = null;
    (config as any).googleAccessToken = null;
    (config as any).googleTokenExpiry = null;
    await platform.getUserStore().saveUserConfig(userId, config);
  } catch (e) {
    console.error("Failed to clear Google token:", e);
  }
}

async function clearGithubToken(userId?: string) {
  if (!userId || userId === 'local-user' || userId === 'guest') return;
  try {
    const config = await platform.getUserStore().getUserConfig(userId);
    config.githubToken = null;
    config.encryptedGithubToken = null;
    config.githubTokenExpiry = null;
    await platform.getUserStore().saveUserConfig(userId, config);
  } catch (e) {
    console.error("Failed to clear GitHub token:", e);
  }
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
          description: 'Persists session state to Google Drive appDataFolder',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Unique identifier for the session' },
              refresh_token: { type: 'string', description: 'Google OAuth2 refresh token' },
              expires_at: { type: 'string', description: 'Optional ISO timestamp or epoch MS for token expiration' },
              user_email: { type: 'string', description: 'Optional user email for expiration notifications' }
            },
            required: ['session_id'],
          },
        },
        {
          name: 'read_index',
          description: 'Read folder index catalog from Google Drive',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Folder path' }
            }
          }
        },
        {
          name: 'read_notice',
          description: 'Read the NOTICE guidelines file',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'append_commit',
          description: 'Append commit or persist state',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string' },
              content: { type: 'string' }
            },
            required: ['session_id', 'content']
          }
        },
        {
          name: 'sync_to_github',
          description: 'Commits session state or repository files to GitHub',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Unique identifier for the session' },
              github_token: { type: 'string', description: 'GitHub Personal Access Token (PAT)' },
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              commit_message: { type: 'string', description: 'Commit message for the update' },
              filePath: { type: 'string', description: 'Optional file path within the repository' },
            },
            required: ['session_id', 'commit_message'],
          },
        },
      ],
    };
  });

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
            content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          };
        }
        
        case 'update_context': {
          const { session_id, patch_data, expected_version } = args as { session_id: string; patch_data: any; expected_version: number };
          const payload = sessionStore.get(session_id);
          if (!payload) {
            throw new McpError(ErrorCode.InvalidParams, `Session ${session_id} not found in memory.`);
          }
          if (payload.metadata.version !== expected_version) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Version mismatch for session ${session_id}. Expected version ${payload.metadata.version}, got ${expected_version}.`
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
            content: [{ type: 'text', text: JSON.stringify(updatedPayload, null, 2) }],
          };
        }

        case 'read_notice': {
          return {
            content: [{ type: 'text', text: "Notice: Kankali Context Hub operational. Ensure valid OAuth credentials." }]
          };
        }
        
        case 'sync_to_drive':
        case 'read_index':
        case 'append_commit': {
          const session_id = (args as any).session_id || 'default_session';
          const refresh_token = (args as any).refresh_token || userConfig.googleRefreshToken;
          const expires_at = (args as any).expires_at || userConfig.googleTokenExpiry;
          const user_email = (args as any).user_email || userConfig.userProfile?.email;

          if (!refresh_token) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              "Google Drive is not connected. Open Kankali web UI and sign in with Google to re-authenticate."
            );
          }

          if (isTokenExpired({ accessToken: refresh_token, expiresAt: expires_at })) {
            if (user_email) {
              await sendExpirationEmail(user_email).catch(console.error);
            }
            await clearGoogleToken(userId);
            throw new McpError(
              ErrorCode.InvalidRequest,
              "Your Google token expired. Please open the Kankali web UI and Re-Authenticate with Google."
            );
          }

          let payload = sessionStore.get(session_id);
          if (!payload) {
            payload = { metadata: { version: 1, last_updated: new Date().toISOString() }, working_memory: {}, tasks: [] };
            sessionStore.set(session_id, payload);
          }

          try {
            const driveAdapter = new DriveAdapter(refresh_token);
            const fileId = await driveAdapter.save_to_appdata(session_id, payload);
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Successfully synced to Drive`, fileId }) }],
            };
          } catch (apiErr: any) {
            const errStr = apiErr.message || String(apiErr);
            if (errStr.includes('401') || errStr.includes('403') || errStr.includes('invalid_grant') || errStr.includes('expired')) {
              await clearGoogleToken(userId);
              if (user_email) {
                await sendExpirationEmail(user_email).catch(console.error);
              }
              throw new McpError(
                ErrorCode.InvalidRequest,
                "Your Google token expired or was revoked. Please open the Kankali web UI and Re-Authenticate with Google."
              );
            }
            throw new McpError(ErrorCode.InvalidRequest, `Google Drive error: ${errStr}`);
          }
        }
        
        case 'sync_to_github': {
          const { session_id, commit_message, filePath } = args as { 
            session_id: string; 
            commit_message: string;
            filePath?: string;
          };
          const github_token = (args as any).github_token || userConfig.githubToken || (userConfig.encryptedGithubToken ? 'decrypted_token' : null);
          const owner = (args as any).owner || userConfig.linkedRepo?.owner;
          const repo = (args as any).repo || userConfig.linkedRepo?.name;

          if (!github_token || !owner || !repo) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              "GitHub is not connected. Open Kankali web UI and connect GitHub to re-authenticate."
            );
          }

          let payload = sessionStore.get(session_id);
          if (!payload) {
            payload = { metadata: { version: 1, last_updated: new Date().toISOString() }, working_memory: {}, tasks: [] };
            sessionStore.set(session_id, payload);
          }

          try {
            const actualToken = userConfig.githubToken || github_token;
            const githubAdapter = new GitHubAdapter(actualToken, owner, repo);
            const sha = await githubAdapter.sync_context_to_repo(session_id, payload, commit_message, filePath);
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Successfully synced to GitHub repository`, sha }) }],
            };
          } catch (apiErr: any) {
            const errStr = apiErr.message || String(apiErr);
            if (errStr.includes('401') || errStr.includes('403') || errStr.includes('Bad credentials')) {
              await clearGithubToken(userId);
              throw new McpError(
                ErrorCode.InvalidRequest,
                "Your GitHub token expired or was revoked. Please open the Kankali web UI and re-authenticate with GitHub."
              );
            }
            throw new McpError(ErrorCode.InvalidRequest, `GitHub error: ${errStr}`);
          }
        }
        
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
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
  console.error('AI-to-AI Context MCP Server running on stdio');
}

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  run().catch((error) => {
    console.error('Fatal error in main:', error);
    process.exit(1);
  });
}
