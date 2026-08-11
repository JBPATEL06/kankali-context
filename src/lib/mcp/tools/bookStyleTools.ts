import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { DriveAdapter } from '../driveAdapter';
import { GitHubAdapter } from '../githubAdapter';
import { isTokenExpired, sendExpirationEmail } from '../authGuard';
import { PlatformAdapter } from '../../../../platform';
import { ContextPayload, CommitLogEntry } from '../types';
import fs from 'fs';
import path from 'path';

// Fallback in-memory session map for legacy get_context / update_context
const inMemorySessionStore = new Map<string, ContextPayload>();

export interface ToolExecutionContext {
  userId: string;
  userConfig: any;
  platform: PlatformAdapter;
}

/**
 * Returns tool definitions for all Book-Style Context System tools.
 */
export function getBookStyleToolDefinitions() {
  return [
    {
      name: 'write_file',
      description: 'Creates or updates a file (Markdown, JSON, text) in Google Drive or GitHub with read-back verification and automated commit logging.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Target file path (e.g., /architecture/tech-stack.md or index.md)' },
          content: { type: 'string', description: 'Full text/markdown/JSON content to write' },
          commit_message: { type: 'string', description: 'Optional commit or log message describing the change' },
          author: { type: 'string', description: 'Author or agent identity making the modification' },
          storage: { type: 'string', enum: ['drive', 'github'], description: 'Target storage provider (defaults to drive)' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'read_file',
      description: 'Reads the content and metadata of a file from Google Drive or GitHub context repository.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read (e.g., /notice.md, /index.md, /plans/roadmap.md)' },
          storage: { type: 'string', enum: ['drive', 'github'], description: 'Storage provider (defaults to drive)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'create_folder',
      description: 'Creates a directory / subfolder in Google Drive context repository.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Folder path to create (e.g., /architecture or /plans)' },
          author: { type: 'string', description: 'Author or agent identity' },
        },
        required: ['path'],
      },
    },
    {
      name: 'read_folder',
      description: 'Lists all files and subfolders in a specific directory in Google Drive or GitHub context tree.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Folder path to inspect (defaults to root /)' },
          storage: { type: 'string', enum: ['drive', 'github'], description: 'Storage provider (defaults to drive)' },
        },
      },
    },
    {
      name: 'delete_file',
      description: 'Deletes a file from Google Drive or GitHub and logs the action in commit.md.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path of the file to delete' },
          commit_message: { type: 'string', description: 'Reason/summary for deletion' },
          author: { type: 'string', description: 'Author or agent identity' },
          storage: { type: 'string', enum: ['drive', 'github'], description: 'Storage provider (defaults to drive)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'delete_folder',
      description: 'Deletes a directory from Google Drive context tree and logs the action in commit.md.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path of the folder to delete' },
          author: { type: 'string', description: 'Author or agent identity' },
        },
        required: ['path'],
      },
    },
    {
      name: 'append_commit',
      description: 'Explicitly appends a revision or work log entry to the Google Drive commit.md ledger.',
      inputSchema: {
        type: 'object',
        properties: {
          target_path: { type: 'string', description: 'Target file or module path' },
          summary: { type: 'string', description: 'Description of changes made' },
          action: { type: 'string', enum: ['create', 'update', 'delete', 'sync', 'move'], description: 'Action type' },
          author: { type: 'string', description: 'Author or agent identity' },
        },
        required: ['target_path', 'summary'],
      },
    },
    {
      name: 'read_notice',
      description: 'Reads the active operational directives and constraints from notice.md.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'read_index',
      description: 'Reads the master table of contents and document catalog from index.md.',
      inputSchema: {
        type: 'object',
        properties: {
          storage: { type: 'string', enum: ['drive', 'github'], description: 'Storage provider (defaults to drive)' },
        },
      },
    },
    {
      name: 'sync_to_drive',
      description: 'Persists context state to Google Drive.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Unique identifier for the session' },
          refresh_token: { type: 'string', description: 'Optional Google OAuth2 refresh token override' },
          filePath: { type: 'string', description: 'Optional file path within context tree' },
        },
        required: ['session_id'],
      },
    },
    {
      name: 'sync_to_github',
      description: 'Commits context files to a linked GitHub repository.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Unique identifier for the session' },
          commit_message: { type: 'string', description: 'Commit message for the update' },
          filePath: { type: 'string', description: 'Optional file path in repository' },
          github_token: { type: 'string', description: 'Optional GitHub PAT override' },
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
        },
        required: ['session_id', 'commit_message'],
      },
    },
    // Legacy Alias Tools
    {
      name: 'get_context',
      description: '[Legacy Alias] Retrieves shared session context payload, proxied to Book-Style storage.',
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
      description: '[Legacy Alias] Patches working memory with optimistic locking, proxied to Book-Style storage.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Unique identifier for the session' },
          patch_data: { type: 'object', description: 'Partial context payload to merge' },
          expected_version: { type: 'number', description: 'Expected current version number' },
        },
        required: ['session_id', 'patch_data', 'expected_version'],
      },
    },
  ];
}

/**
 * Handles incoming tool executions for Book-Style tools and legacy proxies.
 */
export async function handleBookStyleToolCall(
  name: string,
  args: any,
  ctx: ToolExecutionContext
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { userId, userConfig, platform } = ctx;

  const getDriveAdapter = () => {
    const refreshToken = args?.refresh_token || userConfig?.googleRefreshToken || userConfig?.googleAccessToken;
    if (!refreshToken) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Google Drive is not connected. Open Kankali web UI and sign in with Google to authenticate.'
      );
    }

    const expiresAt = args?.expires_at || userConfig?.googleTokenExpiry;
    if (isTokenExpired({ accessToken: userConfig?.googleAccessToken, expiresAt })) {
      if (userConfig?.userProfile?.email) {
        sendExpirationEmail(userConfig.userProfile.email).catch(console.error);
      }
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Your Google token has expired. Please open the Kankali web UI and re-authenticate with Google.'
      );
    }

    return new DriveAdapter(refreshToken);
  };

  const getGitHubAdapter = () => {
    let token = args?.github_token || userConfig?.githubToken;
    if (!token && userConfig?.encryptedGithubToken) {
      try {
        token = platform.decryptSecret(userConfig.encryptedGithubToken);
      } catch (err: any) {
        console.error('Failed to decrypt GitHub token:', err.message);
      }
    }

    const owner = args?.owner || userConfig?.linkedRepo?.owner;
    const repo = args?.repo || userConfig?.linkedRepo?.name;
    const branch = args?.branch || userConfig?.linkedRepo?.defaultBranch || 'main';

    if (!token || !owner || !repo) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'GitHub is not connected. Open Kankali web UI and connect a GitHub repository to authenticate.'
      );
    }

    return new GitHubAdapter(token, owner, repo, branch);
  };

  switch (name) {
    case 'write_file': {
      const { path: filePath, content, commit_message, author, storage = 'drive' } = args;
      if (!filePath || typeof content !== 'string') {
        throw new McpError(ErrorCode.InvalidParams, 'path and content are required for write_file.');
      }

      if (storage === 'github') {
        const gh = getGitHubAdapter();
        const res = await gh.write_file(filePath, content, commit_message || `Update ${filePath}`);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, file: res }, null, 2) }] };
      } else {
        const drive = getDriveAdapter();
        const res = await drive.write_file(filePath, content, commit_message, author);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, file: res }, null, 2) }] };
      }
    }

    case 'read_file': {
      const { path: filePath, storage = 'drive' } = args;
      if (!filePath) {
        throw new McpError(ErrorCode.InvalidParams, 'path is required for read_file.');
      }

      if (storage === 'github') {
        const gh = getGitHubAdapter();
        const res = await gh.read_file(filePath);
        return { content: [{ type: 'text', text: res.content }] };
      } else {
        const drive = getDriveAdapter();
        const res = await drive.read_file(filePath);
        return { content: [{ type: 'text', text: res.content }] };
      }
    }

    case 'create_folder': {
      const { path: folderPath, author } = args;
      if (!folderPath) {
        throw new McpError(ErrorCode.InvalidParams, 'path is required for create_folder.');
      }
      const drive = getDriveAdapter();
      const folder = await drive.create_folder(folderPath, author);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, folder }, null, 2) }] };
    }

    case 'read_folder': {
      const { path: folderPath = '/', storage = 'drive' } = args;
      if (storage === 'github') {
        const gh = getGitHubAdapter();
        const res = await gh.list_folder(folderPath);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } else {
        const drive = getDriveAdapter();
        const res = await drive.list_folder(folderPath);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
    }

    case 'delete_file': {
      const { path: filePath, commit_message, author, storage = 'drive' } = args;
      if (!filePath) {
        throw new McpError(ErrorCode.InvalidParams, 'path is required for delete_file.');
      }

      if (storage === 'github') {
        const gh = getGitHubAdapter();
        const res = await gh.delete_file(filePath, commit_message || `Delete ${filePath}`);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } else {
        const drive = getDriveAdapter();
        const res = await drive.delete_file(filePath, commit_message, author);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
    }

    case 'delete_folder': {
      const { path: folderPath, author } = args;
      if (!folderPath) {
        throw new McpError(ErrorCode.InvalidParams, 'path is required for delete_folder.');
      }
      const drive = getDriveAdapter();
      const res = await drive.delete_folder(folderPath, author);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
    }

    case 'append_commit': {
      const { target_path, summary, action = 'update', author } = args;
      if (!target_path || !summary) {
        throw new McpError(ErrorCode.InvalidParams, 'target_path and summary are required for append_commit.');
      }

      const drive = getDriveAdapter();
      const entry: CommitLogEntry = {
        timestamp: new Date().toISOString(),
        author: author || 'mcp-agent',
        action: action as any,
        targetPath: target_path,
        summary,
      };

      await drive.append_commit(entry);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, entry }, null, 2) }] };
    }

    case 'read_notice': {
      try {
        const drive = getDriveAdapter();
        const res = await drive.read_file('notice.md');
        return { content: [{ type: 'text', text: res.content }] };
      } catch {
        // Fallback to local repo docs/notice.md
        const localNoticePath = path.resolve(process.cwd(), 'docs/notice.md');
        if (fs.existsSync(localNoticePath)) {
          return { content: [{ type: 'text', text: fs.readFileSync(localNoticePath, 'utf8') }] };
        }
        return { content: [{ type: 'text', text: '# Notice\n\nKankali Context Hub operational.' }] };
      }
    }

    case 'read_index': {
      const { storage = 'drive' } = args;
      try {
        if (storage === 'github') {
          const gh = getGitHubAdapter();
          const res = await gh.read_file('index.md');
          return { content: [{ type: 'text', text: res.content }] };
        } else {
          const drive = getDriveAdapter();
          const res = await drive.read_file('index.md');
          return { content: [{ type: 'text', text: res.content }] };
        }
      } catch {
        const localIndexPath = path.resolve(process.cwd(), 'docs/index.md');
        if (fs.existsSync(localIndexPath)) {
          return { content: [{ type: 'text', text: fs.readFileSync(localIndexPath, 'utf8') }] };
        }
        return { content: [{ type: 'text', text: '# Index\n\nNo index.md found yet.' }] };
      }
    }

    case 'sync_to_drive': {
      const { session_id, filePath } = args;
      if (!session_id) {
        throw new McpError(ErrorCode.InvalidParams, 'session_id is required for sync_to_drive.');
      }

      let payload = inMemorySessionStore.get(session_id);
      if (!payload) {
        payload = { metadata: { version: 1, last_updated: new Date().toISOString() }, working_memory: {}, tasks: [] };
        inMemorySessionStore.set(session_id, payload);
      }

      const drive = getDriveAdapter();
      const targetPath = filePath || `.context/${session_id}.json`;
      const file = await drive.write_file(targetPath, JSON.stringify(payload, null, 2), `Sync session ${session_id}`);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Successfully synced to Drive', file }, null, 2) }] };
    }

    case 'sync_to_github': {
      const { session_id, commit_message, filePath } = args;
      if (!session_id || !commit_message) {
        throw new McpError(ErrorCode.InvalidParams, 'session_id and commit_message are required for sync_to_github.');
      }

      let payload = inMemorySessionStore.get(session_id);
      if (!payload) {
        payload = { metadata: { version: 1, last_updated: new Date().toISOString() }, working_memory: {}, tasks: [] };
        inMemorySessionStore.set(session_id, payload);
      }

      const gh = getGitHubAdapter();
      const targetPath = filePath || `.context/${session_id}.json`;
      const file = await gh.write_file(targetPath, JSON.stringify(payload, null, 2), commit_message);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Successfully synced to GitHub', sha: file.sha }, null, 2) }] };
    }

    // --- Legacy Alias Handlers ---
    case 'get_context': {
      const { session_id } = args;
      if (!session_id) {
        throw new McpError(ErrorCode.InvalidParams, 'session_id is required for get_context.');
      }

      // Try reading from Drive .context/{session_id}.json if configured, else in-memory
      try {
        const drive = getDriveAdapter();
        const res = await drive.read_file(`.context/${session_id}.json`);
        const parsed = JSON.parse(res.content);
        inMemorySessionStore.set(session_id, parsed);
        return { content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }] };
      } catch {
        let payload = inMemorySessionStore.get(session_id);
        if (!payload) {
          payload = {
            metadata: { version: 1, last_updated: new Date().toISOString() },
            working_memory: {},
            tasks: [],
          };
          inMemorySessionStore.set(session_id, payload);
        }
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      }
    }

    case 'update_context': {
      const { session_id, patch_data, expected_version } = args;
      if (!session_id || expected_version === undefined) {
        throw new McpError(ErrorCode.InvalidParams, 'session_id and expected_version are required for update_context.');
      }

      let payload = inMemorySessionStore.get(session_id);
      if (!payload) {
        try {
          const drive = getDriveAdapter();
          const res = await drive.read_file(`.context/${session_id}.json`);
          payload = JSON.parse(res.content);
        } catch {
          throw new McpError(ErrorCode.InvalidParams, `Session ${session_id} not found.`);
        }
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
        },
      };

      inMemorySessionStore.set(session_id, updatedPayload);

      // Write-through to Drive if available
      try {
        const drive = getDriveAdapter();
        await drive.write_file(
          `.context/${session_id}.json`,
          JSON.stringify(updatedPayload, null, 2),
          `Update context session ${session_id} to v${updatedPayload.metadata.version}`
        );
      } catch {
        // In-memory fallback is updated
      }

      return { content: [{ type: 'text', text: JSON.stringify(updatedPayload, null, 2) }] };
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
}
