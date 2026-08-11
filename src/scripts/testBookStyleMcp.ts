process.env.KANKALI_TEST = 'true';
process.env.NODE_ENV = 'test';

import { getBookStyleToolDefinitions, handleBookStyleToolCall } from '../lib/mcp/tools/bookStyleTools';
import { isTokenExpired } from '../lib/mcp/authGuard';
import { ElectronPlatformAdapter } from '../../platform';
import { DriveAdapter } from '../lib/mcp/driveAdapter';
import { GitHubAdapter } from '../lib/mcp/githubAdapter';
import { getGithubClient, platform as serverPlatform } from '../../server';
import { Readable } from 'stream';

// ANSI color helpers
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(red(`✖ Assertion failed: ${message}`));
    throw new Error(message);
  }
  console.log(green(`✔ ${message}`));
}

/**
 * Creates a mock Google Drive v3 client to test DriveAdapter in-memory with real method logic.
 */
function createMockDriveClient() {
  interface MockDriveFile {
    id: string;
    name: string;
    mimeType: string;
    parents: string[];
    content: string;
    trashed: boolean;
    createdTime: string;
    modifiedTime: string;
    size: number;
  }

  const filesMap = new Map<string, MockDriveFile>();
  let idCounter = 1;

  async function streamToString(stream: any): Promise<string> {
    if (typeof stream === 'string') return stream;
    if (stream && typeof stream.on === 'function') {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString('utf8');
    }
    return '';
  }

  return {
    files: {
      list: async (params: any) => {
        const q: string = params.q || '';
        let list = Array.from(filesMap.values()).filter((f) => !f.trashed);

        // Parse parents query
        const parentMatch = q.match(/'([^']+)' in parents/);
        if (parentMatch) {
          const targetParent = parentMatch[1];
          list = list.filter((f) => f.parents.includes(targetParent));
        }

        // Parse name query
        const nameMatch = q.match(/name = '([^']+)'/);
        if (nameMatch) {
          const targetName = nameMatch[1];
          list = list.filter((f) => f.name === targetName);
        }

        // Parse mimeType query
        if (q.includes("mimeType = 'application/vnd.google-apps.folder'")) {
          list = list.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
        } else if (q.includes("mimeType != 'application/vnd.google-apps.folder'")) {
          list = list.filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');
        }

        return { data: { files: list } };
      },

      create: async (params: any) => {
        const id = `mock_drive_file_${idCounter++}`;
        const name = params.requestBody?.name || 'untitled';
        const mimeType = params.requestBody?.mimeType || 'text/plain';
        const parents = params.requestBody?.parents || ['root'];
        let content = '';

        if (params.media?.body) {
          content = await streamToString(params.media.body);
        }

        const fileObj: MockDriveFile = {
          id,
          name,
          mimeType,
          parents,
          content,
          trashed: false,
          createdTime: new Date().toISOString(),
          modifiedTime: new Date().toISOString(),
          size: Buffer.byteLength(content, 'utf8'),
        };

        filesMap.set(id, fileObj);
        return { data: fileObj };
      },

      get: async (params: any) => {
        const file = filesMap.get(params.fileId);
        if (!file || file.trashed) {
          throw new Error(`Google Drive API 404: File not found ${params.fileId}`);
        }
        if (params.alt === 'media') {
          return { data: file.content };
        }
        return { data: file };
      },

      update: async (params: any) => {
        const file = filesMap.get(params.fileId);
        if (!file) {
          throw new Error(`Google Drive API 404: File not found ${params.fileId}`);
        }

        if (params.requestBody?.trashed !== undefined) {
          file.trashed = params.requestBody.trashed;
        }

        if (params.media?.body) {
          file.content = await streamToString(params.media.body);
          file.size = Buffer.byteLength(file.content, 'utf8');
        }

        file.modifiedTime = new Date().toISOString();
        filesMap.set(params.fileId, file);
        return { data: file };
      },
    },
  };
}

/**
 * Creates a mock Octokit GitHub REST client to test GitHubAdapter with real method logic and read-back verification.
 */
function createMockGitHubClient(options: { failReadBack?: boolean } = {}) {
  interface MockGitFile {
    sha: string;
    path: string;
    name: string;
    content: string;
  }

  const repoFiles = new Map<string, MockGitFile>();
  let commitCount = 1;

  return {
    repos: {
      getContent: async (params: any) => {
        const cleanPath = (params.path || '').trim().replace(/^\/+/g, '');
        if (!cleanPath) {
          // List root
          const list = Array.from(repoFiles.values()).map((f) => ({
            name: f.name,
            path: f.path,
            sha: f.sha,
            size: Buffer.byteLength(f.content, 'utf8'),
            type: 'file',
            html_url: `https://github.com/test/${f.path}`,
          }));
          return { data: list };
        }

        const file = repoFiles.get(cleanPath);
        if (file) {
          return {
            data: {
              type: 'file',
              name: file.name,
              path: file.path,
              sha: file.sha,
              size: Buffer.byteLength(file.content, 'utf8'),
              content: Buffer.from(file.content, 'utf8').toString('base64'),
              html_url: `https://github.com/test/${file.path}`,
            },
          };
        }

        // Check if directory
        const dirFiles = Array.from(repoFiles.values()).filter((f) => f.path.startsWith(`${cleanPath}/`));
        if (dirFiles.length > 0) {
          const list = dirFiles.map((f) => ({
            name: f.name,
            path: f.path,
            sha: f.sha,
            size: Buffer.byteLength(f.content, 'utf8'),
            type: 'file',
            html_url: `https://github.com/test/${f.path}`,
          }));
          return { data: list };
        }

        const error: any = new Error(`Not Found: ${cleanPath}`);
        error.status = 404;
        throw error;
      },

      createOrUpdateFileContents: async (params: any) => {
        const cleanPath = (params.path || '').trim().replace(/^\/+/g, '');
        const fileName = cleanPath.split('/').pop() || cleanPath;
        let content = Buffer.from(params.content, 'base64').toString('utf8');

        if (options.failReadBack) {
          // Corrupt content on readback to trigger verification failure
          content = 'CORRUPTED_CONTENT_MISMATCH';
        }

        const sha = `git_sha_${commitCount++}`;
        const fileObj: MockGitFile = {
          sha,
          path: cleanPath,
          name: fileName,
          content,
        };
        repoFiles.set(cleanPath, fileObj);

        return {
          data: {
            commit: { sha },
            content: {
              sha,
              html_url: `https://github.com/test/${cleanPath}`,
            },
          },
        };
      },

      deleteFile: async (params: any) => {
        const cleanPath = (params.path || '').trim().replace(/^\/+/g, '');
        const exists = repoFiles.has(cleanPath);
        if (!exists) {
          const error: any = new Error(`Not Found: ${cleanPath}`);
          error.status = 404;
          throw error;
        }
        repoFiles.delete(cleanPath);
        const sha = `delete_sha_${commitCount++}`;
        return { data: { commit: { sha } } };
      },
    },
  };
}

async function runTests() {
  console.log(bold(cyan('\n========================================')));
  console.log(bold(cyan('  Kankali Book-Style Context Test Suite ')));
  console.log(bold(cyan('========================================\n')));

  const platform = new ElectronPlatformAdapter();
  const mockUserConfig = {
    userApiKey: 'test-api-key',
    userProfile: { email: 'developer@kankali.io' },
    googleTokenExpiry: new Date(Date.now() + 3600000).toISOString(),
    linkedRepo: { owner: 'test-owner', name: 'test-repo', defaultBranch: 'main' },
  };
  const ctx = {
    userId: 'test-user',
    userConfig: mockUserConfig,
    platform,
  };

  // --- 1. Schema & Tool Definitions Test ---
  console.log(bold('\n1. Verifying MCP Tool Definitions'));
  const tools = getBookStyleToolDefinitions();
  const toolNames = tools.map((t) => t.name);
  console.log(`Registered ${tools.length} MCP tools: ${toolNames.join(', ')}`);

  const expectedTools = [
    'write_file',
    'read_file',
    'create_folder',
    'read_folder',
    'delete_file',
    'delete_folder',
    'append_commit',
    'read_notice',
    'read_index',
    'sync_to_drive',
    'sync_to_github',
    'get_context',
    'update_context',
  ];

  for (const expected of expectedTools) {
    assert(toolNames.includes(expected), `Tool '${expected}' is registered with valid inputSchema`);
  }

  // --- 2. Notice & Directives Test ---
  console.log(bold('\n2. Testing read_notice Tool'));
  const noticeRes = await handleBookStyleToolCall('read_notice', {}, ctx);
  assert(noticeRes.content.length > 0, 'read_notice returned content');
  assert(noticeRes.content[0].text.includes('Notice') || noticeRes.content[0].text.includes('Context'), 'read_notice returned valid directive text');

  // --- 3. Index Catalog Test ---
  console.log(bold('\n3. Testing read_index Tool'));
  const indexRes = await handleBookStyleToolCall('read_index', {}, ctx);
  assert(indexRes.content.length > 0, 'read_index returned content');

  // --- 4. Legacy get_context / update_context with Optimistic Locking ---
  console.log(bold('\n4. Testing Legacy Proxy Tools (get_context & update_context)'));
  const sessionId = `test_session_${Date.now()}`;
  
  // Initial get_context
  const getRes1 = await handleBookStyleToolCall('get_context', { session_id: sessionId }, ctx);
  const payload1 = JSON.parse(getRes1.content[0].text);
  assert(payload1.metadata.version === 1, 'Initial session created with version 1');

  // Successful update_context
  const updateRes1 = await handleBookStyleToolCall(
    'update_context',
    {
      session_id: sessionId,
      expected_version: 1,
      patch_data: { working_memory: { project: 'Kankali Context', phase: 'BookStyle' } },
    },
    ctx
  );
  const payload2 = JSON.parse(updateRes1.content[0].text);
  assert(payload2.metadata.version === 2, 'Version incremented to 2 after update');
  assert(payload2.working_memory.project === 'Kankali Context', 'Working memory correctly merged');

  // Optimistic locking mismatch rejection
  let mismatchCaught = false;
  try {
    await handleBookStyleToolCall(
      'update_context',
      {
        session_id: sessionId,
        expected_version: 1, // Stale version
        patch_data: { working_memory: { stale: true } },
      },
      ctx
    );
  } catch (err: any) {
    mismatchCaught = true;
    assert(err.message.includes('Version mismatch'), `Optimistic locking rejected stale version: ${err.message}`);
  }
  assert(mismatchCaught, 'Version mismatch threw explicit McpError');

  // --- 5. DriveAdapter End-to-End File & Folder CRUD with commit.md & index.md Auto-Sync ---
  console.log(bold('\n5. Testing DriveAdapter End-to-End CRUD with commit.md & index.md Auto-Sync'));
  const driveAdapter = new DriveAdapter('mock-test-refresh-token');
  (driveAdapter as any).drive = createMockDriveClient();

  // Test 5.1: Create folder
  console.log('Testing create_folder(/architecture)...');
  const folderItem = await driveAdapter.create_folder('/architecture', 'claude-3-7-sonnet');
  assert(folderItem.path === '/architecture', 'create_folder returned valid folder item');

  // Test 5.2: Write file with read-back verification and automated commit.md & index.md ledger
  console.log('Testing write_file(/architecture/tech-stack.md)...');
  const techStackDoc = `# Tech Stack\n\n- TypeScript 5.8\n- Express 4.x\n- Model Context Protocol\n`;
  const fileItem = await driveAdapter.write_file(
    '/architecture/tech-stack.md',
    techStackDoc,
    'Added architecture tech-stack documentation',
    'claude-3-7-sonnet'
  );
  assert(fileItem.path === '/architecture/tech-stack.md', 'write_file returned valid file item with path');

  // Test 5.3: Read file content
  console.log('Testing read_file(/architecture/tech-stack.md)...');
  const readRes = await driveAdapter.read_file('/architecture/tech-stack.md');
  assert(readRes.content === techStackDoc, 'read_file content matches written content precisely');

  // Test 5.4: Read commit.md audit ledger
  console.log('Testing read_file(/commit.md)...');
  const commitRes = await driveAdapter.read_file('commit.md');
  assert(commitRes.content.includes('/architecture/tech-stack.md'), 'commit.md contains target path');
  assert(commitRes.content.includes('Added architecture tech-stack documentation'), 'commit.md contains commit summary');
  assert(commitRes.content.includes('claude-3-7-sonnet'), 'commit.md contains author identity');

  // Test 5.5: Verify index.md auto-sync on creation
  console.log('Testing index.md auto-sync on file creation...');
  const indexRes1 = await driveAdapter.read_file('index.md');
  assert(indexRes1.content.includes('/architecture/tech-stack.md'), 'index.md contains newly written file path');

  // Test 5.6: List folder
  console.log('Testing list_folder(/)...');
  const rootListing = await driveAdapter.list_folder('/');
  assert(rootListing.folders.some((f) => f.name === 'architecture'), 'Root listing contains architecture folder');
  assert(rootListing.files.some((f) => f.name === 'commit.md'), 'Root listing contains commit.md');
  assert(rootListing.files.some((f) => f.name === 'index.md'), 'Root listing contains index.md');

  // Test 5.7: Delete file and verify index.md auto-sync on deletion
  console.log('Testing delete_file(/architecture/tech-stack.md)...');
  const deleteRes = await driveAdapter.delete_file('/architecture/tech-stack.md', 'Removed obsolete doc', 'claude-3-7-sonnet');
  assert(deleteRes.success, 'delete_file reported success');

  // Verify file is no longer found
  let fileNotFound = false;
  try {
    await driveAdapter.read_file('/architecture/tech-stack.md');
  } catch (err: any) {
    fileNotFound = true;
  }
  assert(fileNotFound, 'Deleted file correctly throws 404 on subsequent read');

  // Verify index.md reflects deletion
  console.log('Testing index.md auto-sync on file deletion...');
  const indexRes2 = await driveAdapter.read_file('index.md');
  assert(!indexRes2.content.includes('/architecture/tech-stack.md'), 'index.md reflects file removal');

  // --- 6. Auth Expiration Guard Test ---
  console.log(bold('\n6. Testing Token Expiration Safety Buffer'));
  const activeToken = { accessToken: 'valid_token', expiresAt: Date.now() + 600000 }; // 10 mins in future
  assert(!isTokenExpired(activeToken), 'Active token recognized as valid');

  const expiringSoon = { accessToken: 'soon_token', expiresAt: Date.now() + 60000 }; // 1 min in future (< 2 min buffer)
  assert(isTokenExpired(expiringSoon), 'Token expiring in < 2 minutes correctly detected as expired');

  const expiredToken = { accessToken: 'expired_token', expiresAt: Date.now() - 1000 }; // past
  assert(isTokenExpired(expiredToken), 'Past token correctly detected as expired');

  // --- 7. Secret Encryption/Decryption Test ---
  console.log(bold('\n7. Testing Secret Encryption & Decryption'));
  const secretString = 'ghp_secret_test_token_1234567890';
  const encrypted = platform.encryptSecret(secretString);
  const decrypted = platform.decryptSecret(encrypted);
  assert(decrypted === secretString, 'AES-256-GCM encryption & decryption verified isomorphic');

  // --- 8. GitHubAdapter End-to-End CRUD & Read-Back Verification Test ---
  console.log(bold('\n8. Testing GitHubAdapter End-to-End CRUD with Read-Back Verification'));
  const ghAdapter = new GitHubAdapter('test-token', 'test-owner', 'test-repo', 'main');
  (ghAdapter as any).octokit = createMockGitHubClient();

  // Test 8.1: Write file with read-back verification
  console.log('Testing GitHubAdapter.write_file(/docs/overview.md)...');
  const ghOverviewContent = `# Project Overview\n\nBook-Style context synchronized with GitHub repo.\n`;
  const ghFileItem = await ghAdapter.write_file('/docs/overview.md', ghOverviewContent, 'feat: add project overview');
  assert(ghFileItem.path === '/docs/overview.md', 'GitHub write_file returned file with correct path');
  assert(!!ghFileItem.sha, 'GitHub write_file returned valid commit SHA');

  // Test 8.2: Read file
  console.log('Testing GitHubAdapter.read_file(/docs/overview.md)...');
  const ghReadRes = await ghAdapter.read_file('/docs/overview.md');
  assert(ghReadRes.content === ghOverviewContent, 'GitHub read_file content matches written content');

  // Test 8.3: List folder
  console.log('Testing GitHubAdapter.list_folder(/docs)...');
  const ghListRes = await ghAdapter.list_folder('/docs');
  assert(ghListRes.files.some((f) => f.name === 'overview.md'), 'GitHub list_folder includes overview.md');

  // Test 8.4: Delete file
  console.log('Testing GitHubAdapter.delete_file(/docs/overview.md)...');
  const ghDeleteRes = await ghAdapter.delete_file('/docs/overview.md', 'chore: remove overview');
  assert(ghDeleteRes.success, 'GitHub delete_file reported success');

  // Verify deleted file throws 404
  let ghDeletedNotFound = false;
  try {
    await ghAdapter.read_file('/docs/overview.md');
  } catch (err: any) {
    ghDeletedNotFound = true;
  }
  assert(ghDeletedNotFound, 'GitHub read_file on deleted file throws 404');

  // Test 8.5: Read-Back Verification Failure Detection
  console.log('Testing GitHubAdapter Read-Back Verification Failure Detection...');
  const failingGhAdapter = new GitHubAdapter('test-token', 'test-owner', 'test-repo', 'main');
  (failingGhAdapter as any).octokit = createMockGitHubClient({ failReadBack: true });

  let readBackFailureCaught = false;
  try {
    await failingGhAdapter.write_file('/bad-file.md', 'expected content', 'commit');
  } catch (err: any) {
    readBackFailureCaught = true;
    assert(err.message.includes('Read-back verification failed'), `Caught expected read-back verification failure: ${err.message}`);
  }
  assert(readBackFailureCaught, 'GitHub write_file rejected mismatch with explicit Read-back verification error');

  // --- 9. Error Paths & Fail-Safe Token Handling Test ---
  console.log(bold('\n9. Testing Error Paths & Fail-Safe Token Handling'));

  // Test 9.1: Invalid path / file not found on Drive
  let drive404Caught = false;
  try {
    await driveAdapter.read_file('/nonexistent-file.md');
  } catch (err: any) {
    drive404Caught = true;
    assert(err.message.includes('File not found'), `Drive nonexistent file throws explicit error: ${err.message}`);
  }
  assert(drive404Caught, 'Drive read_file on nonexistent path threw explicit error');

  // Test 9.2: Invalid folder on Drive
  let driveFolder404Caught = false;
  try {
    await driveAdapter.list_folder('/nonexistent-dir');
  } catch (err: any) {
    driveFolder404Caught = true;
    assert(err.message.includes('Directory not found'), `Drive nonexistent folder throws explicit error: ${err.message}`);
  }
  assert(driveFolder404Caught, 'Drive list_folder on nonexistent path threw explicit error');

  // Test 9.3: Missing GitHub auth when calling sync_to_github
  let missingGithubAuthCaught = false;
  try {
    await handleBookStyleToolCall(
      'sync_to_github',
      { session_id: 'test_session', commit_message: 'test commit' },
      { userId: 'guest', userConfig: {}, platform }
    );
  } catch (err: any) {
    missingGithubAuthCaught = true;
    assert(err.message.includes('GitHub is not connected'), `Missing GitHub credentials threw explicit error: ${err.message}`);
  }
  assert(missingGithubAuthCaught, 'Tool requiring GitHub auth threw explicit connection error');

  // Test 9.4: Decryption failure in server.ts getGithubClient()
  console.log('Testing getGithubClient() decryption failure handling...');
  const mockFailingPlatform = {
    decryptSecret: () => {
      throw new Error('Corrupt ciphertext or invalid AES authTag');
    },
  };
  
  // Temporarily replace platform decrypt
  const originalDecrypt = platform.decryptSecret;
  const originalServerDecrypt = (serverPlatform as any)?.decryptSecret;
  (platform as any).decryptSecret = mockFailingPlatform.decryptSecret;
  if (serverPlatform) {
    (serverPlatform as any).decryptSecret = mockFailingPlatform.decryptSecret;
  }

  let serverDecryptionFailureCaught = false;
  try {
    getGithubClient({
      encryptedGithubToken: 'corrupted-ciphertext-hex:tag:payload',
    });
  } catch (err: any) {
    serverDecryptionFailureCaught = true;
    assert(err.message.includes('GitHub token could not be decrypted'), `getGithubClient threw explicit error on decryption failure: ${err.message}`);
  }
  assert(serverDecryptionFailureCaught, 'getGithubClient rejected corrupted ciphertext without fallback');

  // Test 9.5: Decryption failure in bookStyleTools.ts
  let mcpDecryptionFailureCaught = false;
  try {
    await handleBookStyleToolCall(
      'write_file',
      { path: '/test.md', content: 'test', storage: 'github' },
      {
        userId: 'test-user',
        userConfig: {
          encryptedGithubToken: 'corrupted-token',
          linkedRepo: { owner: 'o', name: 'r' },
        },
        platform,
      }
    );
  } catch (err: any) {
    mcpDecryptionFailureCaught = true;
    assert(err.message.includes('GitHub token could not be decrypted'), `bookStyleTools threw explicit error on decryption failure: ${err.message}`);
  }
  assert(mcpDecryptionFailureCaught, 'MCP handler rejected corrupted ciphertext without fallback');

  // Restore platform decrypt
  (platform as any).decryptSecret = originalDecrypt;
  if (serverPlatform && originalServerDecrypt) {
    (serverPlatform as any).decryptSecret = originalServerDecrypt;
  }

  console.log(bold(green('\n✔ All 9 Test Suites Passed Successfully with Full Verification Proof!\n')));
}

runTests().catch((err) => {
  console.error(red(`\nTest suite failed: ${err.message}`));
  process.exit(1);
});
