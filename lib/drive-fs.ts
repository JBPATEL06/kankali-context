/**
 * Free-form Google Drive App Data API for Kankali Drive MCP.
 * Files are stored flat in spaces='appDataFolder' with slash-paths as names.
 */

export interface DriveFile {
  id: string;
  name: string; // The flat filename e.g. "project/kankali/index.md"
  updatedAt: string; // From appProperties or modifiedTime
  size?: number;
}

export function safePath(path: string): string {
  const p = path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((s) => s && s !== "." && s !== "..")
    .join("/");
  if (!p) throw new Error("path is empty");
  if (p.includes("..")) throw new Error("invalid path");
  return p;
}

// High-efficiency in-memory caches for Serverless warm containers
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const fileListCache = new Map<string, { files: DriveFile[]; expiresAt: number }>();

export function invalidateDriveCache(accessToken?: string) {
  if (accessToken) {
    fileListCache.delete(accessToken);
  } else {
    fileListCache.clear();
  }
}

export async function refreshGoogleToken(refreshToken: string): Promise<string> {
  const cached = tokenCache.get(refreshToken);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to refresh Google token: ${res.status} ${err}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("No access_token returned from Google");
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  // Cache for 50 minutes (3000 seconds) to avoid redundant round-trips
  tokenCache.set(refreshToken, {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(expiresIn - 300, 60) * 1000,
  });

  return data.access_token;
}

export async function listAllDriveFiles(accessToken: string): Promise<DriveFile[]> {
  const cached = fileListCache.get(accessToken);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.files;
  }

  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,appProperties,modifiedTime,size)&pageSize=1000",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to list Drive files: ${res.status}`);
  }

  const data = await res.json();
  const files: any[] = data.files || [];

  const mapped: DriveFile[] = files.map((f) => ({
    id: f.id,
    name: f.name,
    updatedAt: f.appProperties?.updatedAt || f.modifiedTime,
    size: f.size ? parseInt(f.size, 10) : undefined,
  }));

  // Cache directory list for 15 seconds during active session bursts
  fileListCache.set(accessToken, {
    files: mapped,
    expiresAt: Date.now() + 15 * 1000,
  });

  return mapped;
}

export async function listTree(
  accessToken: string,
  prefix = ""
): Promise<Array<{ path: string; type: "blob" | "tree"; size?: number; updatedAt?: string }>> {
  const all = await listAllDriveFiles(accessToken);
  const cleanPref = prefix ? safePath(prefix) + "/" : "";

  return all
    .filter((f) => !cleanPref || f.name.startsWith(cleanPref))
    .map((f) => ({
      path: f.name,
      type: "blob" as const,
      size: f.size,
      updatedAt: f.updatedAt,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function listDir(
  accessToken: string,
  path = ""
): Promise<Array<{ name: string; path: string; type: "file" | "dir"; size?: number }>> {
  const clean = path ? safePath(path) : "";
  const prefix = clean ? clean + "/" : "";
  const all = await listAllDriveFiles(accessToken);

  const matched = all.filter((f) => !prefix || f.name.startsWith(prefix));
  const dirs = new Set<string>();
  const files: Array<{ name: string; path: string; type: "file"; size?: number }> = [];

  for (const item of matched) {
    const rel = prefix ? item.name.slice(prefix.length) : item.name;
    const slashIdx = rel.indexOf("/");
    if (slashIdx === -1) {
      // Direct file in this folder
      files.push({
        name: rel,
        path: item.name,
        type: "file",
        size: item.size,
      });
    } else {
      // Subdirectory
      const dirName = rel.slice(0, slashIdx);
      dirs.add(dirName);
    }
  }

  const resultDirs: Array<{ name: string; path: string; type: "dir" }> = Array.from(dirs)
    .sort()
    .map((dirName) => ({
      name: dirName,
      path: prefix ? `${prefix}${dirName}` : dirName,
      type: "dir",
    }));

  files.sort((a, b) => a.name.localeCompare(b.name));

  return [...resultDirs, ...files];
}

export async function getFileMetadata(accessToken: string, filename: string): Promise<DriveFile | null> {
  const clean = safePath(filename);
  const q = encodeURIComponent(`name='${clean}' and 'appDataFolder' in parents and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=appDataFolder&fields=files(id,name,appProperties,modifiedTime,size)&pageSize=1`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to query Drive file: ${res.status}`);
  }

  const data = await res.json();
  if (!data.files || data.files.length === 0) return null;

  const f = data.files[0];
  return {
    id: f.id,
    name: f.name,
    updatedAt: f.appProperties?.updatedAt || f.modifiedTime,
    size: f.size ? parseInt(f.size, 10) : undefined,
  };
}

export async function readFile(
  accessToken: string,
  path: string
): Promise<{ path: string; content: string; updatedAt: string; size: number } | null> {
  const clean = safePath(path);
  const meta = await getFileMetadata(accessToken, clean);
  if (!meta) return null;

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${meta.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to read Drive file content: ${res.status}`);
  }

  const content = await res.text();
  return { path: clean, content, updatedAt: meta.updatedAt, size: meta.size ?? content.length };
}

export async function writeFile(
  accessToken: string,
  path: string,
  content: string
): Promise<{ path: string; updatedAt: string }> {
  const clean = safePath(path);
  const meta = await getFileMetadata(accessToken, clean);
  const now = new Date().toISOString();

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  let method = "POST";

  const metadata: any = {
    appProperties: { updatedAt: now },
  };

  if (meta) {
    url = `https://www.googleapis.com/upload/drive/v3/files/${meta.id}?uploadType=multipart`;
    method = "PATCH";
  } else {
    metadata.name = clean;
    metadata.parents = ["appDataFolder"];
  }

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: text/plain\r\n\r\n" +
    content +
    closeDelim;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(Buffer.byteLength(multipartRequestBody)),
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to write Drive file: ${res.status} ${err}`);
  }

  invalidateDriveCache(accessToken);
  return { path: clean, updatedAt: now };
}

export async function deleteFile(
  accessToken: string,
  path: string
): Promise<{ path: string; deleted: boolean }> {
  const clean = safePath(path);
  const meta = await getFileMetadata(accessToken, clean);
  if (!meta) return { path: clean, deleted: false };

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${meta.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete Drive file: ${res.status}`);
  }

  invalidateDriveCache(accessToken);
  return { path: clean, deleted: true };
}

export async function deleteFolder(
  accessToken: string,
  folderPath: string
): Promise<{ deleted: string[] }> {
  const clean = safePath(folderPath);
  const prefix = clean.endsWith("/") ? clean : `${clean}/`;
  const all = await listAllDriveFiles(accessToken);
  const targets = all.filter((f) => f.name === clean || f.name.startsWith(prefix));

  if (targets.length === 0) {
    return { deleted: [] };
  }

  const deleted: string[] = [];
  for (const f of targets) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok || res.status === 404) {
      deleted.push(f.name);
    }
  }

  invalidateDriveCache(accessToken);
  return { deleted };
}

export const DEFAULT_NOTICE = `# NOTICE — read this before any other tool

You are connected to a **Google Drive App Data context vault** via Kankali MCP (\`/mcp/Drive\`).

## Mandatory flow
1. **read_notice** (this file) — required every session first.
2. **read_index** — map of paths.
3. **current_session_get** — what's live right now (if any).
4. Then use FS / project / session tools as needed.

## When to use which
| Intent | Tools |
|--------|--------|
| Durable fact about a whole project (SDLC) | \`project_upsert\` · \`project_codebase_note\` · \`project_get\` · \`project_list\` |
| Specific bug/task tracked to resolution | \`issues/*\` via \`write_file\` / \`read_file\` |
| What's live in **this** conversation (curated) | \`current_session_set\` · \`current_session_get\` |
| Arbitrary paths | \`list_tree\` · \`read_file\` · \`write_file\` · \`delete_path\` · \`search_files\` |

## Layout (Standard SDLC)
| Path | Purpose |
|------|---------|
| \`NOTICE.md\` | How to use this context vault (keep short) |
| \`index.md\` | Catalog: path → purpose |
| \`project/<slug>/\` | Per-project \`status.md\`, \`docs/\` (\`overview.md\`, \`plan.md\`, \`audit.md\`), \`codebase/\`, \`resources/\` |
| \`issues/<slug>/\` | Per-project active tracked issues (\`current.md\`, \`<issue>.md\`) |
| \`session/current.md\` | Overwritable live session state |
| \`memories/\` | Persona, preferences, long-lived facts |

## Rules (token-efficient)
- Prefer **short** markdown files.
- Check **index.md** before large writes; update it when structure changes.
- Never store plaintext secrets. No raw chat transcripts.
- Under a project, keep \`docs/\` (prose), \`codebase/\` (technical), and \`resources/\` separate.
- \`current_session\` is short-lived; durable decisions go to \`project_*\`.

## Tools
\`read_notice\` · \`read_index\` · \`list_tree\` · \`read_file\` · \`write_file\` · \`delete_path\` · \`search_files\` · \`project_upsert\` · \`project_codebase_note\` · \`project_get\` · \`project_list\` · \`current_session_set\` · \`current_session_get\`
`;

export const DEFAULT_INDEX = `# Index

| Path | Purpose |
|------|---------|
| NOTICE.md | Mandatory how-to for agents |
| index.md | This catalog |
| project/ | Per-project SDLC folders (docs + codebase + resources + status) |
| issues/ | Tracked issues and tasks per project (current.md + issue files) |
| session/current.md | Live curated session state |
| memories/ | Persona, facts, system prompts |

Agents: update this table when you add/remove structure.
`;
