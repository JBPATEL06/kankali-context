import { google, drive_v3 } from 'googleapis';
import { McpFileItem, McpFolderItem, CommitLogEntry } from './types';
import { Readable } from 'stream';

const DEFAULT_ROOT_FOLDER = 'Agentic_AI_Context_Hub';

/**
 * Robust Google Drive Adapter for Book-Style Context Management.
 * Implements hierarchical folder/file CRUD, mandatory read-back verification,
 * and automated commit.md audit ledger maintenance.
 */
export class DriveAdapter {
  private drive: drive_v3.Drive;
  private rootFolderName: string;
  private cachedRootFolderId: string | null = null;

  constructor(userRefreshToken: string, rootFolderName: string = DEFAULT_ROOT_FOLDER) {
    const clientId = process.env.GOOGLE_CLIENT_ID || 'kankali-client-id';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'kankali-client-secret';

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    
    // Support either a refresh token or direct access token
    if (userRefreshToken.startsWith('ya29.')) {
      auth.setCredentials({ access_token: userRefreshToken });
    } else {
      auth.setCredentials({ refresh_token: userRefreshToken });
    }

    this.drive = google.drive({ version: 'v3', auth });
    this.rootFolderName = rootFolderName;
  }

  /**
   * Retrieves or creates the master Context Hub root folder on Google Drive.
   */
  async getOrCreateRootFolder(): Promise<string> {
    if (this.cachedRootFolderId) {
      return this.cachedRootFolderId;
    }

    const query = `name = '${this.rootFolderName}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`;
    const res = await this.drive.files.list({
      q: query,
      fields: 'files(id, name)',
      pageSize: 1,
    });

    if (res.data.files && res.data.files.length > 0) {
      this.cachedRootFolderId = res.data.files[0].id!;
      return this.cachedRootFolderId;
    }

    // Create root folder if missing
    const createRes = await this.drive.files.create({
      requestBody: {
        name: this.rootFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['root'],
        description: 'Kankali Book-Style Context Hub memory repository.',
      },
      fields: 'id',
    });

    this.cachedRootFolderId = createRes.data.id!;
    return this.cachedRootFolderId;
  }

  /**
   * Resolves a directory path (e.g. "/architecture/subfolder") to its Google Drive folder ID.
   */
  async resolveFolderId(folderPath: string = '/', createIfMissing: boolean = false): Promise<string> {
    const rootId = await this.getOrCreateRootFolder();
    const cleanPath = folderPath.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanPath) {
      return rootId;
    }

    const parts = cleanPath.split('/').filter(Boolean);
    let currentParentId = rootId;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const query = `'${currentParentId}' in parents and name = '${part}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const listRes = await this.drive.files.list({
        q: query,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      if (listRes.data.files && listRes.data.files.length > 0) {
        currentParentId = listRes.data.files[0].id!;
      } else {
        if (!createIfMissing) {
          throw new Error(`Directory not found on Google Drive: /${parts.slice(0, i + 1).join('/')}`);
        }

        const createRes = await this.drive.files.create({
          requestBody: {
            name: part,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [currentParentId],
          },
          fields: 'id',
        });

        currentParentId = createRes.data.id!;
      }
    }

    return currentParentId;
  }

  /**
   * Creates a subfolder on Google Drive.
   */
  async create_folder(folderPath: string, author?: string): Promise<McpFolderItem> {
    const cleanPath = folderPath.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanPath) {
      const rootId = await this.getOrCreateRootFolder();
      return { id: rootId, name: this.rootFolderName, path: '/' };
    }

    const folderId = await this.resolveFolderId(cleanPath, true);
    const name = cleanPath.split('/').pop() || cleanPath;

    // Auto-append to commit.md
    await this.append_commit({
      timestamp: new Date().toISOString(),
      author: author || 'mcp-agent',
      action: 'create',
      targetPath: `/${cleanPath}`,
      summary: `Created directory /${cleanPath}`,
    }).catch((e) => console.warn('Failed to append commit for create_folder:', e.message));

    // Auto-sync index.md
    await this.sync_index(`/${cleanPath}`, 'add', `Directory: ${name}`).catch(() => {});

    return {
      id: folderId,
      name,
      path: `/${cleanPath}`,
      createdTime: new Date().toISOString(),
    };
  }

  /**
   * Lists contents of a folder on Google Drive.
   */
  async list_folder(folderPath: string = '/'): Promise<{ folders: McpFolderItem[]; files: McpFileItem[] }> {
    const folderId = await this.resolveFolderId(folderPath, false);
    const cleanPath = folderPath.trim().replace(/^\/+|\/+$/g, '');
    const prefix = cleanPath ? `/${cleanPath}` : '';

    const query = `'${folderId}' in parents and trashed = false`;
    const res = await this.drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, iconLink)',
      orderBy: 'folder,name',
      pageSize: 100,
    });

    const rawFiles = res.data.files || [];
    const folders: McpFolderItem[] = [];
    const files: McpFileItem[] = [];

    for (const item of rawFiles) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        folders.push({
          id: item.id || undefined,
          name: item.name || '',
          path: `${prefix}/${item.name}`,
          parentId: folderId,
          createdTime: item.createdTime || undefined,
          modifiedTime: item.modifiedTime || undefined,
        });
      } else {
        files.push({
          id: item.id || undefined,
          name: item.name || '',
          path: `${prefix}/${item.name}`,
          mimeType: item.mimeType || undefined,
          size: item.size ? Number(item.size) : undefined,
          createdTime: item.createdTime || undefined,
          modifiedTime: item.modifiedTime || undefined,
          webViewLink: item.webViewLink || undefined,
          iconLink: item.iconLink || undefined,
        });
      }
    }

    return { folders, files };
  }

  /**
   * Writes or updates a file on Google Drive with MANDATORY READ-BACK VALIDATION.
   * Automatically maintains commit.md ledger and index.md catalog.
   */
  async write_file(
    filePath: string,
    content: string,
    commitMessage?: string,
    author?: string
  ): Promise<McpFileItem> {
    const cleanPath = filePath.trim().replace(/^\/+/g, '');
    const pathParts = cleanPath.split('/');
    const fileName = pathParts.pop();

    if (!fileName) {
      throw new Error(`Invalid file path: ${filePath}`);
    }

    const folderPath = pathParts.join('/');
    const parentFolderId = await this.resolveFolderId(folderPath, true);

    const mimeType = fileName.endsWith('.json')
      ? 'application/json'
      : fileName.endsWith('.md')
      ? 'text/markdown'
      : 'text/plain';

    // 1. Check if file already exists
    const query = `'${parentFolderId}' in parents and name = '${fileName}' and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
    const listRes = await this.drive.files.list({
      q: query,
      fields: 'files(id, name)',
      pageSize: 1,
    });

    const existingFile = listRes.data.files && listRes.data.files.length > 0 ? listRes.data.files[0] : null;
    let fileId: string;
    const isNew = !existingFile;

    const mediaStream = new Readable();
    mediaStream.push(content);
    mediaStream.push(null);

    if (existingFile && existingFile.id) {
      fileId = existingFile.id;
      await this.drive.files.update({
        fileId: fileId,
        media: {
          mimeType,
          body: mediaStream,
        },
        fields: 'id, name, modifiedTime, size',
      });
    } else {
      const createRes = await this.drive.files.create({
        requestBody: {
          name: fileName,
          mimeType,
          parents: [parentFolderId],
        },
        media: {
          mimeType,
          body: mediaStream,
        },
        fields: 'id, name, createdTime, modifiedTime, size',
      });
      fileId = createRes.data.id!;
    }

    // 2. MANDATORY READ-BACK VERIFICATION (up to 3 retries)
    let verified = false;
    let readBackContent = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const readRes = await this.drive.files.get({
          fileId: fileId,
          alt: 'media',
        });
        readBackContent = typeof readRes.data === 'string' ? readRes.data : JSON.stringify(readRes.data);
        if (readBackContent.trim() === content.trim()) {
          verified = true;
          break;
        }
      } catch (err) {
        // Retry
      }
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }

    if (!verified) {
      throw new Error(`Read-back verification failed for '${filePath}'. Content could not be confirmed.`);
    }

    const fileItem: McpFileItem = {
      id: fileId,
      name: fileName,
      path: `/${cleanPath}`,
      mimeType,
      size: Buffer.byteLength(content, 'utf8'),
      content,
      modifiedTime: new Date().toISOString(),
    };

    // 3. Automated commit.md logging (prevent infinite recursion when writing commit.md itself)
    if (fileName !== 'commit.md') {
      await this.append_commit({
        timestamp: new Date().toISOString(),
        author: author || 'mcp-agent',
        action: isNew ? 'create' : 'update',
        targetPath: `/${cleanPath}`,
        summary: commitMessage || (isNew ? `Created ${fileName}` : `Updated ${fileName}`),
      }).catch((e) => console.warn('Failed to append commit ledger:', e.message));
    }

    // 4. Automated index.md sync (prevent infinite recursion on index/notice/commit files)
    if (!['index.md', 'commit.md', 'notice.md'].includes(fileName)) {
      await this.sync_index(`/${cleanPath}`, 'add', commitMessage || fileName).catch(() => {});
    }

    return fileItem;
  }

  /**
   * Reads a file from Google Drive.
   */
  async read_file(filePath: string): Promise<{ content: string; file: McpFileItem }> {
    const cleanPath = filePath.trim().replace(/^\/+/g, '');
    const pathParts = cleanPath.split('/');
    const fileName = pathParts.pop();

    if (!fileName) {
      throw new Error(`Invalid file path: ${filePath}`);
    }

    const folderPath = pathParts.join('/');
    const parentFolderId = await this.resolveFolderId(folderPath, false);

    const query = `'${parentFolderId}' in parents and name = '${fileName}' and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
    const listRes = await this.drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
      pageSize: 1,
    });

    if (!listRes.data.files || listRes.data.files.length === 0) {
      throw new Error(`File not found on Google Drive: /${cleanPath}`);
    }

    const f = listRes.data.files[0];
    const readRes = await this.drive.files.get({
      fileId: f.id!,
      alt: 'media',
    });

    const rawData = readRes.data;
    const content = typeof rawData === 'string' ? rawData : (typeof rawData === 'object' ? JSON.stringify(rawData, null, 2) : String(rawData));

    return {
      content,
      file: {
        id: f.id!,
        name: f.name!,
        path: `/${cleanPath}`,
        mimeType: f.mimeType || undefined,
        size: f.size ? Number(f.size) : Buffer.byteLength(content, 'utf8'),
        createdTime: f.createdTime || undefined,
        modifiedTime: f.modifiedTime || undefined,
        webViewLink: f.webViewLink || undefined,
      },
    };
  }

  /**
   * Deletes (trashes) a file on Google Drive.
   */
  async delete_file(filePath: string, commitMessage?: string, author?: string): Promise<{ success: boolean; message: string }> {
    const cleanPath = filePath.trim().replace(/^\/+/g, '');
    const pathParts = cleanPath.split('/');
    const fileName = pathParts.pop();

    if (!fileName) {
      throw new Error(`Invalid file path: ${filePath}`);
    }

    const folderPath = pathParts.join('/');
    const parentFolderId = await this.resolveFolderId(folderPath, false);

    const query = `'${parentFolderId}' in parents and name = '${fileName}' and trashed = false`;
    const listRes = await this.drive.files.list({
      q: query,
      fields: 'files(id, name)',
      pageSize: 1,
    });

    if (!listRes.data.files || listRes.data.files.length === 0) {
      throw new Error(`Cannot delete: File '${filePath}' not found.`);
    }

    const fileId = listRes.data.files[0].id!;
    await this.drive.files.update({
      fileId,
      requestBody: { trashed: true },
    });

    if (fileName !== 'commit.md') {
      await this.append_commit({
        timestamp: new Date().toISOString(),
        author: author || 'mcp-agent',
        action: 'delete',
        targetPath: `/${cleanPath}`,
        summary: commitMessage || `Deleted ${fileName}`,
      }).catch(() => {});
    }

    await this.sync_index(`/${cleanPath}`, 'remove').catch(() => {});

    return { success: true, message: `File /${cleanPath} deleted successfully.` };
  }

  /**
   * Deletes (trashes) a folder on Google Drive.
   */
  async delete_folder(folderPath: string, author?: string): Promise<{ success: boolean; message: string }> {
    const cleanPath = folderPath.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanPath) {
      throw new Error("Cannot delete root context directory.");
    }

    const folderId = await this.resolveFolderId(cleanPath, false);
    await this.drive.files.update({
      fileId: folderId,
      requestBody: { trashed: true },
    });

    await this.append_commit({
      timestamp: new Date().toISOString(),
      author: author || 'mcp-agent',
      action: 'delete',
      targetPath: `/${cleanPath}`,
      summary: `Deleted folder /${cleanPath}`,
    }).catch(() => {});

    return { success: true, message: `Folder /${cleanPath} deleted successfully.` };
  }

  /**
   * Appends an entry to the append-only commit.md ledger on Google Drive.
   */
  async append_commit(entry: CommitLogEntry): Promise<void> {
    const rootId = await this.getOrCreateRootFolder();
    let currentContent = '';

    try {
      const readRes = await this.read_file('commit.md');
      currentContent = readRes.content;
    } catch {
      currentContent = [
        '# Google Drive Context Revision Ledger (`commit.md`)',
        '',
        'This append-only ledger records all work and revision history across AI sessions on Google Drive.',
        '',
        '| Timestamp (ISO) | Action | Target Path | Author / Agent | Summary |',
        '|---|---|---|---|---|',
      ].join('\n');
    }

    const logLine = `| ${entry.timestamp} | ${entry.action.toUpperCase()} | \`${entry.targetPath}\` | ${entry.author || 'mcp-agent'} | ${entry.summary.replace(/\|/g, '-')} |`;
    const updatedContent = `${currentContent.trimEnd()}\n${logLine}\n`;

    // Direct update to commit.md with read-back verification
    await this.write_file_raw(rootId, 'commit.md', updatedContent, 'text/markdown');
  }

  /**
   * Synchronizes entries in index.md master catalog.
   */
  async sync_index(targetPath: string, action: 'add' | 'remove', description?: string): Promise<void> {
    const rootId = await this.getOrCreateRootFolder();
    let indexContent = '';

    try {
      const res = await this.read_file('index.md');
      indexContent = res.content;
    } catch {
      indexContent = [
        '# Context Master Index (`index.md`)',
        '',
        'Table of Contents mapping what is stored where.',
        '',
        '## Chapters & Documents',
        '',
      ].join('\n');
    }

    const cleanPath = targetPath.replace(/^\/+/g, '');
    const fileName = cleanPath.split('/').pop() || cleanPath;
    const linkStr = `[${fileName}](file:///${cleanPath})`;
    const linePrefix = `- ${linkStr}:`;

    const lines = indexContent.split('\n');
    const filtered = lines.filter((l) => !l.includes(linkStr));

    if (action === 'add') {
      const newLine = `${linePrefix} ${description || 'Document entry'}`;
      filtered.push(newLine);
    }

    const newContent = `${filtered.join('\n').trimEnd()}\n`;
    await this.write_file_raw(rootId, 'index.md', newContent, 'text/markdown');
  }

  /**
   * Low-level write bypassing commit log hooks to prevent recursion.
   */
  private async write_file_raw(parentFolderId: string, fileName: string, content: string, mimeType: string): Promise<void> {
    const query = `'${parentFolderId}' in parents and name = '${fileName}' and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
    const listRes = await this.drive.files.list({
      q: query,
      fields: 'files(id, name)',
      pageSize: 1,
    });

    const existing = listRes.data.files && listRes.data.files.length > 0 ? listRes.data.files[0] : null;
    let fileId: string;

    const mediaStream = new Readable();
    mediaStream.push(content);
    mediaStream.push(null);

    if (existing && existing.id) {
      fileId = existing.id;
      await this.drive.files.update({
        fileId: fileId,
        media: { mimeType, body: mediaStream },
      });
    } else {
      const createRes = await this.drive.files.create({
        requestBody: {
          name: fileName,
          mimeType,
          parents: [parentFolderId],
        },
        media: { mimeType, body: mediaStream },
        fields: 'id',
      });
      fileId = createRes.data.id!;
    }

    // Read-back verification
    const readRes = await this.drive.files.get({ fileId, alt: 'media' });
    const text = typeof readRes.data === 'string' ? readRes.data : JSON.stringify(readRes.data);
    if (text.trim() !== content.trim()) {
      throw new Error(`Read-back verification failed for raw write: ${fileName}`);
    }
  }

  // --- Legacy Backward Compatibility Methods ---
  async save_to_appdata(session_id: string, payload: Record<string, any>): Promise<string> {
    const filePath = `.context/${session_id}.json`;
    const item = await this.write_file(filePath, JSON.stringify(payload, null, 2), `Legacy sync for session ${session_id}`);
    return item.id || session_id;
  }

  async read_from_appdata(session_id: string): Promise<Record<string, any> | null> {
    try {
      const res = await this.read_file(`.context/${session_id}.json`);
      return JSON.parse(res.content);
    } catch {
      return null;
    }
  }
}
