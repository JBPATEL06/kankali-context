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
          required: ['session_id', 'refresh_token'],
        },
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
            filePath: { type: 'string', description: 'Optional file path within the repository (defaults to .context/session_id.json)' },
          },
          required: ['session_id', 'github_token', 'owner', 'repo', 'commit_message'],
        },
      },
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
        
        // If not in memory, initialize a default one.
        // In a real scenario with passed credentials, we might attempt to load from Drive/GitHub here.
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
        
        // Optimistic Locking: Verify expected version matches current version
        if (payload.metadata.version !== expected_version) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Version mismatch for session ${session_id}. Expected version ${payload.metadata.version}, but got ${expected_version}. Another process may have updated the context. Please get_context and retry.`
          );
        }
        
        // Apply patch
        const updatedPayload: ContextPayload = {
          ...payload,
          ...patch_data,
          metadata: {
            ...payload.metadata,
            ...(patch_data?.metadata || {}),
            version: payload.metadata.version + 1, // Increment version by 1
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
        const { session_id, refresh_token, expires_at, user_email } = args as { 
          session_id: string; 
          refresh_token: string;
          expires_at?: string | number;
          user_email?: string;
        };
        
        // Auth Guard Validation
        if (isTokenExpired({ accessToken: refresh_token, expiresAt: expires_at })) {
          if (user_email) {
            await sendExpirationEmail(user_email).catch(console.error);
          }
          throw new McpError(
            ErrorCode.InvalidRequest,
            "Authentication Error: Google Drive OAuth token has expired. Request rejected. Please direct the user to go to the web interface and re-login with Google Drive to restore context synchronization."
          );
        }
        
        const payload = sessionStore.get(session_id);
        if (!payload) {
          throw new McpError(ErrorCode.InvalidParams, `Session ${session_id} not found in memory. Cannot sync.`);
        }
        
        const driveAdapter = new DriveAdapter(refresh_token);
        const fileId = await driveAdapter.save_to_appdata(session_id, payload);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: `Successfully synced to Drive appDataFolder`, fileId }),
            },
          ],
        };
      }
      
      case 'sync_to_github': {
        const { session_id, github_token, owner, repo, commit_message, filePath } = args as { 
          session_id: string; 
          github_token: string; 
          owner: string; 
          repo: string; 
          commit_message: string;
          filePath?: string;
        };
        
        const payload = sessionStore.get(session_id);
        if (!payload) {
          throw new McpError(ErrorCode.InvalidParams, `Session ${session_id} not found in memory. Cannot sync.`);
        }
        
        const githubAdapter = new GitHubAdapter(github_token, owner, repo);
        const sha = await githubAdapter.sync_context_to_repo(session_id, payload, commit_message, filePath);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: `Successfully synced to GitHub repository`, sha }),
            },
          ],
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

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AI-to-AI Context MCP Server running on stdio');
}

run().catch((error) => {
  console.error('Fatal error in main:', error);
  process.exit(1);
});
