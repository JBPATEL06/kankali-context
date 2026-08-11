import { ContextMemory, DriveFileItem, DriveFolderItem } from '../types';

const FOLDER_NAME = 'Agentic_AI_Context_Hub';

/**
 * Custom Error thrown specifically when Google OAuth Access Token is expired, invalid, or unauthorized (HTTP 401).
 */
export class GoogleTokenExpiredError extends Error {
  public isTokenExpired = true;
  constructor(message = 'Your Google Authentication Token has expired or is invalid (HTTP 401). Please sign in again to save your changes.') {
    super(message);
    this.name = 'GoogleTokenExpiredError';
  }
}

/**
 * Helper to inspect Google Drive API response and throw GoogleTokenExpiredError if status is 401 or response message indicates token failure.
 */
export async function checkResponseForTokenError(res: Response, defaultMsg: string): Promise<never> {
  let errJson: any = {};
  try {
    errJson = await res.json();
  } catch (e) {
    // JSON parse fallback
  }

  const msg = errJson.error?.message || res.statusText || defaultMsg;
  const isExpired =
    res.status === 401 ||
    msg.toLowerCase().includes('invalid credentials') ||
    msg.toLowerCase().includes('token expired') ||
    msg.toLowerCase().includes('unauthenticated') ||
    msg.toLowerCase().includes('invalid_token') ||
    msg.toLowerCase().includes('auth') ||
    msg.toLowerCase().includes('unauthorized');

  if (isExpired) {
    throw new GoogleTokenExpiredError(`Google Auth Token Expired: ${msg}`);
  }
  throw new Error(`${defaultMsg}: ${msg}`);
}

/**
 * Validates whether the Google OAuth Access Token is currently active and valid.
 */
export async function validateGoogleDriveToken(accessToken: string): Promise<{ valid: boolean; error?: string }> {
  if (!accessToken) {
    return { valid: false, error: 'No Google access token provided.' };
  }
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) {
      return { valid: false, error: 'Google Auth Token has expired or is unauthorized (HTTP 401).' };
    }
    if (!res.ok) {
      return { valid: false, error: `Google API error status ${res.status}: ${res.statusText}` };
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Network error verifying token.' };
  }
}

/**
 * Serializes a memory item into Markdown format with YAML frontmatter.
 */
export function memoryToMarkdown(m: ContextMemory): string {
  const lines = [
    '---',
    `id: "${m.id}"`,
    `title: "${m.title.replace(/"/g, '\\"')}"`,
    `category: "${m.category}"`,
    `tags: [${(m.tags || []).map((t) => `"${t}"`).join(', ')}]`,
    `agent: "${m.createdByAgent || 'Claude MCP Agent'}"`,
    `namespace: "${m.agentNamespace || 'default'}"`,
    `updatedAt: "${m.updatedAt}"`,
    '---',
    '',
    `# ${m.title}`,
    '',
    `> **Summary**: ${m.summary}`,
    '',
    '## Memory Content',
    m.content,
    ''
  ];

  if (m.claudeFormat) {
    lines.push('## Claude XML Context', '```xml', m.claudeFormat, '```', '');
  }

  return lines.join('\n');
}

/**
 * Parses Markdown or plain text into a structured ContextMemory object.
 */
export function parseTextOrMarkdownToMemory(rawText: string, fileId: string, fileName: string): ContextMemory {
  const frontmatterMatch = rawText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const metadata: Record<string, any> = {};

  if (frontmatterMatch) {
    const yamlLines = frontmatterMatch[1].split('\n');
    for (const line of yamlLines) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith('[') && val.endsWith(']')) {
          metadata[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
        } else {
          metadata[key] = val;
        }
      }
    }
  }

  const body = frontmatterMatch ? rawText.slice(frontmatterMatch[0].length).trim() : rawText.trim();
  const titleMatch = body.match(/^#\s+(.*)/m);
  const cleanTitle = metadata.title || (titleMatch ? titleMatch[1].trim() : fileName.replace(/\.[^/.]+$/, ''));

  return {
    id: metadata.id || `ctx-import-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title: cleanTitle,
    category: (metadata.category as any) || (fileName.endsWith('.md') ? 'code_artifact' : 'fact_memory'),
    summary: metadata.summary || cleanTitle,
    content: body,
    tags: Array.isArray(metadata.tags) ? metadata.tags : ['imported_drive_doc'],
    platforms: ['claude'],
    createdByAgent: metadata.agent || 'Drive Import Connector',
    agentNamespace: metadata.namespace || 'default',
    driveFileId: fileId,
    driveFileName: fileName,
    createdAt: metadata.createdAt || new Date().toISOString(),
    updatedAt: metadata.updatedAt || new Date().toISOString(),
  };
}

/**
 * Searches for or creates the dedicated "/Agentic_AI_Context_Hub" folder on user's Google Drive.
 * Supports private app-data folder scope or standard folder.
 */
export async function getOrCreateContextHubFolder(accessToken: string, usePrivateAppData = false): Promise<string> {
  const parentFolder = usePrivateAppData ? 'appDataFolder' : 'root';
  const query = encodeURIComponent(`name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

  const response = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    await checkResponseForTokenError(response, 'Google Drive API error finding folder');
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Folder does not exist yet; create it
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const folderMetadata = {
    name: FOLDER_NAME,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentFolder],
    description: 'Agentic AI Context Hub memory repository for Claude, Grok, ChatGPT, and Gemini context sync.',
  };

  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(folderMetadata),
  });

  if (!createRes.ok) {
    await checkResponseForTokenError(createRes, 'Failed to create Google Drive folder');
  }

  const newFolder = await createRes.json();
  return newFolder.id;
}

/**
 * Creates a subfolder in Google Drive under parentFolderId.
 */
export async function createDriveFolder(
  accessToken: string,
  folderName: string,
  parentFolderId: string
): Promise<DriveFolderItem> {
  const createUrl = 'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,createdTime,modifiedTime';
  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentFolderId],
  };

  const res = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(folderMetadata),
  });

  if (!res.ok) {
    await checkResponseForTokenError(res, `Failed to create subfolder '${folderName}'`);
  }

  const newFolder = await res.json();
  return {
    id: newFolder.id,
    name: newFolder.name,
    parentId: parentFolderId,
    mimeType: 'application/vnd.google-apps.folder',
    createdTime: newFolder.createdTime,
    modifiedTime: newFolder.modifiedTime,
  };
}

/**
 * Lists all subfolders and files inside a specific folder on Google Drive.
 */
export async function listFolderContents(
  accessToken: string,
  folderId: string
): Promise<{ folders: DriveFolderItem[]; files: DriveFileItem[] }> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent('files(id, name, mimeType, parents, webViewLink, iconLink, createdTime, modifiedTime, size)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=folder,name`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    await checkResponseForTokenError(res, 'Failed to list folder contents');
  }

  const data = await res.json();
  const rawList: any[] = data.files || [];

  const folders: DriveFolderItem[] = [];
  const files: DriveFileItem[] = [];

  for (const item of rawList) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      folders.push({
        id: item.id,
        name: item.name,
        parentId: folderId,
        mimeType: 'application/vnd.google-apps.folder',
        createdTime: item.createdTime,
        modifiedTime: item.modifiedTime,
      });
    } else {
      files.push({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        parentId: folderId,
        webViewLink: item.webViewLink,
        iconLink: item.iconLink,
        createdTime: item.createdTime,
        modifiedTime: item.modifiedTime,
        size: item.size,
      });
    }
  }

  return { folders, files };
}

/**
 * Moves or renames an item (file or folder) in Google Drive.
 */
export async function moveDriveItem(
  accessToken: string,
  itemId: string,
  newParentId?: string,
  oldParentId?: string,
  newName?: string
): Promise<any> {
  const params = new URLSearchParams();
  params.set('fields', 'id,name,mimeType,parents,modifiedTime');
  if (newParentId) params.set('addParents', newParentId);
  if (oldParentId) params.set('removeParents', oldParentId);

  const url = `https://www.googleapis.com/drive/v3/files/${itemId}?${params.toString()}`;
  const body: any = {};
  if (newName) body.name = newName;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    await checkResponseForTokenError(res, 'Failed to move/rename Drive item');
  }

  return await res.json();
}

/**
 * Lists all files inside the Agentic AI Context Hub folder on Google Drive.
 */
export async function listDriveFiles(accessToken: string, folderId: string): Promise<DriveFileItem[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent('files(id, name, mimeType, parents, webViewLink, iconLink, createdTime, modifiedTime, size)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    await checkResponseForTokenError(res, 'Failed to list Drive files');
  }

  const data = await res.json();
  const rawList: any[] = data.files || [];
  return rawList.map((item) => ({
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    parentId: folderId,
    webViewLink: item.webViewLink,
    iconLink: item.iconLink,
    createdTime: item.createdTime,
    modifiedTime: item.modifiedTime,
    size: item.size,
  }));
}

/**
 * Uploads or updates a file (JSON, Markdown, or text) in Google Drive
 * with MANDATORY READ-BACK VALIDATION to guarantee content was saved.
 */
export async function uploadDriveFile(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  content: string,
  existingFileId?: string
): Promise<DriveFileItem> {
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = existingFileId
    ? { name: fileName, mimeType }
    : { name: fileName, mimeType, parents: [folderId] };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n` +
    content +
    closeDelimiter;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime,size`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime,size`;

  const method = existingFileId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    await checkResponseForTokenError(res, 'Failed to save file to Drive');
  }

  const savedItem = await res.json();

  // Read-back save verification (up to 3 attempts)
  let verificationSuccess = false;
  let attempts = 0;
  let lastVerifyError = '';

  while (!verificationSuccess && attempts < 3) {
    attempts++;
    try {
      const verifyUrl = `https://www.googleapis.com/drive/v3/files/${savedItem.id}?alt=media`;
      const verifyRes = await fetch(verifyUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!verifyRes.ok) {
        if (verifyRes.status === 401) {
          throw new GoogleTokenExpiredError('Google Auth Token expired during read-back save verification.');
        }
        lastVerifyError = `HTTP ${verifyRes.status}: ${verifyRes.statusText}`;
      } else {
        const savedContent = await verifyRes.text();
        if (savedContent === content) {
          verificationSuccess = true;
          break;
        } else {
          lastVerifyError = `Read-back size/content mismatch (Expected ${content.length} bytes, received ${savedContent.length} bytes)`;
        }
      }
    } catch (e: any) {
      if (e instanceof GoogleTokenExpiredError || e.isTokenExpired) {
        throw e;
      }
      lastVerifyError = e.message || 'Verification read-back exception';
      console.warn(`Drive write verification attempt ${attempts} failed:`, e);
    }

    if (!verificationSuccess && attempts < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
    }
  }

  if (!verificationSuccess) {
    throw new Error(`Google Drive Save Verification Failed: File '${fileName}' was uploaded but read-back verification failed (${lastVerifyError}). Your changes were NOT verified as saved.`);
  }

  return {
    ...savedItem,
    verifiedSaved: true,
  };
}

/**
 * Downloads a file's raw content from Google Drive.
 */
export async function downloadDriveFile(accessToken: string, fileId: string): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    await checkResponseForTokenError(res, 'Failed to download file from Google Drive');
  }

  return await res.text();
}

/**
 * Deletes a file from Google Drive.
 */
export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 404) {
    await checkResponseForTokenError(res, 'Failed to delete file from Drive');
  }
}

/**
 * Syncs all context memories to Google Drive as individual JSON files & a master index.
 * Validates token and performs verified save read-backs for every file.
 */
export async function syncContextMemoriesToDrive(
  accessToken: string,
  memories: ContextMemory[]
): Promise<{ updatedMemories: ContextMemory[]; folderId: string; driveFolderUrl: string }> {
  // Pre-flight token validation
  const tokenCheck = await validateGoogleDriveToken(accessToken);
  if (!tokenCheck.valid) {
    throw new GoogleTokenExpiredError(tokenCheck.error || 'Google Auth Token is invalid or expired.');
  }

  const folderId = await getOrCreateContextHubFolder(accessToken);
  const existingFiles = await listDriveFiles(accessToken, folderId);

  const existingFileMap = new Map<string, string>(); // name -> fileId
  existingFiles.forEach((file) => existingFileMap.set(file.name, file.id));

  const now = new Date().toISOString();
  const updatedMemories: ContextMemory[] = [];

  for (const memory of memories) {
    const safeTitle = memory.title.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 35);
    const fileName = `ctx_${memory.category}_${safeTitle}_${memory.id.slice(0, 6)}.json`;
    const fileId = memory.driveFileId || existingFileMap.get(fileName);

    const payload = JSON.stringify(
      {
        ...memory,
        lastSyncedAt: now,
        _syncSource: 'Agentic AI Context Hub',
      },
      null,
      2
    );

    const savedFile = await uploadDriveFile(
      accessToken,
      folderId,
      fileName,
      'application/json',
      payload,
      fileId
    );

    updatedMemories.push({
      ...memory,
      driveFileId: savedFile.id,
      driveFileName: fileName,
      lastSyncedAt: now,
      updatedAt: now,
    });
  }

  // Upload master index file
  const indexFileName = '_context_hub_index.json';
  const indexFileId = existingFileMap.get(indexFileName);
  const indexContent = JSON.stringify(
    {
      app: 'Agentic AI Context Hub',
      lastSyncedAt: now,
      totalCount: updatedMemories.length,
      categories: {
        system_prompts: updatedMemories.filter((m) => m.category === 'system_prompt').length,
        fact_memories: updatedMemories.filter((m) => m.category === 'fact_memory').length,
        chat_histories: updatedMemories.filter((m) => m.category === 'chat_history').length,
        code_artifacts: updatedMemories.filter((m) => m.category === 'code_artifact').length,
      },
      items: updatedMemories.map((m) => ({
        id: m.id,
        title: m.title,
        category: m.category,
        platforms: m.platforms,
        driveFileId: m.driveFileId,
        driveFileName: m.driveFileName,
      })),
    },
    null,
    2
  );

  await uploadDriveFile(accessToken, folderId, indexFileName, 'application/json', indexContent, indexFileId);

  // Create backup snapshot
  try {
    const backupFolderName = '_Backups';
    const folderContents = await listFolderContents(accessToken, folderId);
    let backupFolder = folderContents.folders.find((f) => f.name === backupFolderName);
    
    if (!backupFolder) {
      backupFolder = await createDriveFolder(accessToken, backupFolderName, folderId);
    }
    
    if (backupFolder && backupFolder.id) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `snapshot_${timestamp}.json`;
      const backupContent = JSON.stringify(updatedMemories, null, 2);
      
      await uploadDriveFile(accessToken, backupFolder.id, backupFileName, 'application/json', backupContent);
      
      // Keep only the last 10 snapshots
      const backupFiles = await listDriveFiles(accessToken, backupFolder.id);
      if (backupFiles.length > 10) {
        const filesToDelete = backupFiles.slice(10);
        for (const file of filesToDelete) {
          await deleteDriveFile(accessToken, file.id);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to create Drive backup snapshot:', err);
  }

  return {
    updatedMemories,
    folderId,
    driveFolderUrl: `https://drive.google.com/drive/folders/${folderId}`,
  };
}

/**
 * Imports context memory files (.json, .md, .txt) from Google Drive into the application.
 */
export async function importContextMemoriesFromDrive(
  accessToken: string,
  usePrivateAppData = false
): Promise<{ memories: ContextMemory[]; folderId: string }> {
  const tokenCheck = await validateGoogleDriveToken(accessToken);
  if (!tokenCheck.valid) {
    throw new GoogleTokenExpiredError(tokenCheck.error || 'Google Auth Token is invalid or expired.');
  }

  const folderId = await getOrCreateContextHubFolder(accessToken, usePrivateAppData);
  const files = await listDriveFiles(accessToken, folderId);

  const supportedFiles = files.filter(
    (f) =>
      !f.name.startsWith('_') &&
      (f.name.endsWith('.json') || f.name.endsWith('.md') || f.name.endsWith('.txt'))
  );

  const imported: ContextMemory[] = [];

  for (const file of supportedFiles) {
    try {
      const rawText = await downloadDriveFile(accessToken, file.id);
      
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(rawText);
        if (data.id && data.title && data.category) {
          imported.push({
            ...data,
            driveFileId: file.id,
            driveFileName: file.name,
            lastSyncedAt: file.modifiedTime || new Date().toISOString(),
          });
        }
      } else if (file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        const parsed = parseTextOrMarkdownToMemory(rawText, file.id, file.name);
        imported.push(parsed);
      }
    } catch (e: any) {
      if (e instanceof GoogleTokenExpiredError || e.isTokenExpired) {
        throw e;
      }
      console.warn(`Failed to import context file ${file.name}:`, e);
    }
  }

  return { memories: imported, folderId };
}
