/**
 * Free-form GitHub Contents API for Kankali git MCP.
 * Paths are relative to repo root. Prefer .md files.
 */
import { Octokit } from "@octokit/rest";
import type { GithubConfig } from "@/types";

function client(token: string) {
  return new Octokit({ auth: token });
}

function toBase64(text: string) {
  return Buffer.from(text, "utf8").toString("base64");
}
function fromBase64(b64: string) {
  return Buffer.from(b64, "base64").toString("utf8");
}

/** Normalize and guard paths (no escape outside repo). */
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

export async function listDir(
  cfg: GithubConfig,
  path = ""
): Promise<Array<{ name: string; path: string; type: "file" | "dir"; size?: number }>> {
  const octokit = client(cfg.token);
  const clean = path ? safePath(path) : "";
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: cfg.owner,
      repo: cfg.repo,
      path: clean,
      ref: cfg.branch,
    });
    if (!Array.isArray(data)) {
      if (data.type === "file") {
        return [
          {
            name: data.name,
            path: data.path,
            type: "file",
            size: data.size,
          },
        ];
      }
      return [];
    }
    return data
      .map((i) => ({
        name: i.name,
        path: i.path,
        type: (i.type === "dir" ? "dir" : "file") as "file" | "dir",
        size: i.size,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) return [];
    throw err;
  }
}

export async function listTree(
  cfg: GithubConfig,
  prefix = ""
): Promise<Array<{ path: string; type: "blob" | "tree"; size?: number }>> {
  if (process.env.NODE_ENV === "development" && process.env.ENABLE_TEST_USERS === "true") {
    return [
      { path: "NOTICE.md", type: "blob", size: 120 },
      { path: `project/${cfg.owner}/status.md`, type: "blob", size: 240 },
    ];
  }
  const octokit = client(cfg.token);
  const { data: refData } = await octokit.rest.git.getRef({
    owner: cfg.owner,
    repo: cfg.repo,
    ref: `heads/${cfg.branch}`,
  });
  const { data: commit } = await octokit.rest.git.getCommit({
    owner: cfg.owner,
    repo: cfg.repo,
    commit_sha: refData.object.sha,
  });
  const { data: tree } = await octokit.rest.git.getTree({
    owner: cfg.owner,
    repo: cfg.repo,
    tree_sha: commit.tree.sha,
    recursive: "true",
  });
  const pref = prefix ? safePath(prefix) + "/" : "";
  return (tree.tree ?? [])
    .filter((i) => i.path && (!pref || i.path.startsWith(pref)))
    .filter((i) => i.type === "blob" || i.type === "tree")
    .map((i) => ({
      path: i.path as string,
      type: i.type as "blob" | "tree",
      size: i.size,
    }));
}

export async function readFile(
  cfg: GithubConfig,
  path: string
): Promise<{ path: string; content: string; sha: string; size: number } | null> {
  const p = safePath(path);
  if (process.env.NODE_ENV === "development" && process.env.ENABLE_TEST_USERS === "true") {
    const mockContent = `# Stored Context for ${cfg.owner} in repo ${cfg.repo}\nFile: ${p}\nOwner: ${cfg.owner}\nBranch: ${cfg.branch}`;
    return { path: p, content: mockContent, sha: `mock-sha-${cfg.owner}`, size: mockContent.length };
  }
  const octokit = client(cfg.token);
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: cfg.owner,
      repo: cfg.repo,
      path: p,
      ref: cfg.branch,
    });
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return null;
    const content = fromBase64(data.content);
    return { path: p, content, sha: data.sha, size: data.size ?? content.length };
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

export async function writeFile(
  cfg: GithubConfig,
  path: string,
  content: string,
  message?: string
): Promise<{ path: string; sha: string }> {
  const p = safePath(path);
  const octokit = client(cfg.token);
  let sha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: cfg.owner,
      repo: cfg.repo,
      path: p,
      ref: cfg.branch,
    });
    if (!Array.isArray(data) && data.type === "file" && "sha" in data) {
      sha = data.sha;
    }
  } catch (err: unknown) {
    if ((err as { status?: number })?.status !== 404) throw err;
  }

  const today = new Date().toISOString().slice(0, 10);
  const payload: Parameters<typeof octokit.rest.repos.createOrUpdateFileContents>[0] = {
    owner: cfg.owner,
    repo: cfg.repo,
    path: p,
    message: message || today,
    content: toBase64(content),
    branch: cfg.branch,
  };
  if (sha) payload.sha = sha;

  const { data } = await octokit.rest.repos.createOrUpdateFileContents(payload);
  return { path: p, sha: data.content?.sha ?? "" };
}

export async function deleteFile(
  cfg: GithubConfig,
  path: string,
  message?: string
): Promise<{ path: string; deleted: boolean }> {
  const p = safePath(path);
  const octokit = client(cfg.token);
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: cfg.owner,
      repo: cfg.repo,
      path: p,
      ref: cfg.branch,
    });
    if (Array.isArray(data) || data.type !== "file" || !("sha" in data)) {
      return { path: p, deleted: false };
    }
    const todayDel = new Date().toISOString().slice(0, 10);
    await octokit.rest.repos.deleteFile({
      owner: cfg.owner,
      repo: cfg.repo,
      path: p,
      message: message || todayDel,
      sha: data.sha,
      branch: cfg.branch,
    });
    return { path: p, deleted: true };
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) return { path: p, deleted: false };
    throw err;
  }
}

export async function deleteFolder(
  cfg: GithubConfig,
  folderPath: string
): Promise<{ deleted: string[] }> {
  const pref = safePath(folderPath);
  const tree = await listTree(cfg, pref);
  const blobs = tree.filter((t) => t.type === "blob");
  if (blobs.length === 0) {
    return { deleted: [] };
  }

  if (process.env.NODE_ENV === "development" && process.env.ENABLE_TEST_USERS === "true") {
    return { deleted: blobs.map((b) => b.path) };
  }

  const octokit = client(cfg.token);
  const { data: refData } = await octokit.rest.git.getRef({
    owner: cfg.owner,
    repo: cfg.repo,
    ref: `heads/${cfg.branch}`,
  });
  const commitSha = refData.object.sha;

  const { data: commitData } = await octokit.rest.git.getCommit({
    owner: cfg.owner,
    repo: cfg.repo,
    commit_sha: commitSha,
  });
  const baseTreeSha = commitData.tree.sha;

  const treeEntries = blobs.map((b) => ({
    path: b.path,
    mode: "100644" as const,
    type: "blob" as const,
    sha: null,
  }));

  const { data: newTree } = await octokit.rest.git.createTree({
    owner: cfg.owner,
    repo: cfg.repo,
    base_tree: baseTreeSha,
    tree: treeEntries,
  });

  const todayFolder = new Date().toISOString().slice(0, 10);
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner: cfg.owner,
    repo: cfg.repo,
    message: todayFolder,
    tree: newTree.sha,
    parents: [commitSha],
  });

  await octokit.rest.git.updateRef({
    owner: cfg.owner,
    repo: cfg.repo,
    ref: `heads/${cfg.branch}`,
    sha: newCommit.sha,
  });

  return { deleted: blobs.map((b) => b.path) };
}

export const DEFAULT_NOTICE = `# NOTICE — read this before any other tool

You are connected to a **git-backed context repo** via Kankali MCP (\`/mcp/git\`).

## Mandatory flow
1. **read_notice** (this file) — required every session first.
2. **read_index** — map of paths.
3. **current_session_get** — what's live right now (if any).
4. Then use FS / project / session tools as needed.

## When to use which
| Intent | Tools |
|--------|--------|
| Durable fact about a whole project | \`project_upsert\` · \`project_codebase_note\` · \`project_get\` · \`project_list\` |
| Specific bug/task tracked to resolution | \`issues/*\` via \`write_file\` / \`read_file\` |
| What's live in **this** conversation (curated) | \`current_session_set\` · \`current_session_get\` |
| Arbitrary paths | \`list_tree\` · \`read_file\` · \`write_file\` · \`delete_path\` · \`search_files\` |

## Layout
| Path | Purpose |
|------|---------|
| \`NOTICE.md\` | How to use this repo (keep short) |
| \`index.md\` | Catalog: path → purpose |
| \`project/<slug>/\` | Per-project \`docs/\` + \`codebase/\` + \`status.md\` |
| \`session/current.md\` | Overwritable live session state |
| \`memories/\` | Persona, preferences, long-lived facts |

## Rules (token-efficient)
- Prefer **short** markdown files.
- Check **index.md** before large writes; update it when structure changes.
- Never store secrets. No raw chat transcripts (noise-filter directive).
- \`docs/\` vs \`codebase/\` under a project must stay separate.
- \`current_session\` is short-lived; durable decisions go to \`project_*\`.

## Tools
\`read_notice\` · \`read_index\` · \`list_tree\` · \`read_file\` · \`write_file\` · \`delete_path\` · \`search_files\` · \`project_upsert\` · \`project_codebase_note\` · \`project_get\` · \`project_list\` · \`current_session_set\` · \`current_session_get\`
`;

export const DEFAULT_INDEX = `# Index

| Path | Purpose |
|------|---------|
| NOTICE.md | Mandatory how-to for agents |
| index.md | This catalog |
| project/ | Per-project folders (docs + codebase + status) |
| session/current.md | Live curated session state |
| memories/ | Persona, facts, system prompts |

Agents: update this table when you add/remove structure.
`;
