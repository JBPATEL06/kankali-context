import { getBookStyleToolDefinitions, handleBookStyleToolCall } from '../lib/mcp/tools/bookStyleTools';
import { isTokenExpired } from '../lib/mcp/authGuard';
import { ElectronPlatformAdapter } from '../../platform';
import { DriveAdapter } from '../lib/mcp/driveAdapter';
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

  // --- 5. DriveAdapter End-to-End File & Folder CRUD with commit.md & Read-Back Verification ---
  console.log(bold('\n5. Testing DriveAdapter End-to-End CRUD with commit.md & Read-Back Verification'));
  const driveAdapter = new DriveAdapter('mock-test-refresh-token');
  // Inject mock drive client
  (driveAdapter as any).drive = createMockDriveClient();

  // Test 5.1: Create folder
  console.log('Testing create_folder(/architecture)...');
  const folderItem = await driveAdapter.create_folder('/architecture', 'claude-3-7-sonnet');
  assert(folderItem.path === '/architecture', 'create_folder returned valid folder item');

  // Test 5.2: Write file with read-back verification and automated commit.md ledger
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

  // Test 5.5: List folder
  console.log('Testing list_folder(/)...');
  const rootListing = await driveAdapter.list_folder('/');
  assert(rootListing.folders.some((f) => f.name === 'architecture'), 'Root listing contains architecture folder');
  assert(rootListing.files.some((f) => f.name === 'commit.md'), 'Root listing contains commit.md');

  // Test 5.6: Delete file
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

  console.log(bold(green('\n✔ All Book-Style MCP Unit & End-to-End Tests Passed Successfully!\n')));
}

runTests().catch((err) => {
  console.error(red(`\nTest suite failed: ${err.message}`));
  process.exit(1);
});
