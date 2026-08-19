import { z } from "zod";
import type { GithubConfig } from "@/types";
import {
  listDir,
  listTree,
  readFile,
  writeFile,
  deleteFile,
  deleteFolder,
  safePath,
  DEFAULT_NOTICE,
  DEFAULT_INDEX,
} from "./git-fs";
import { createDeleteToken, verifyDeleteToken } from "./delete-token";
import { extractOutline, getSectionChunk, replaceSectionChunk } from "./markdown-chunks";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

function ok(text: string, structured?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: structured,
  };
}

function err(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
    isError: true,
    structuredContent: { error: text },
  };
}

async function ensureNotice(cfg: GithubConfig): Promise<string> {
  const existing = await readFile(cfg, "NOTICE.md");
  if (existing) return existing.content;
  await writeFile(cfg, "NOTICE.md", DEFAULT_NOTICE, "kankali: bootstrap NOTICE.md");
  return DEFAULT_NOTICE;
}

async function ensureIndex(cfg: GithubConfig): Promise<string> {
  const existing = await readFile(cfg, "index.md");
  if (existing) return existing.content;
  await writeFile(cfg, "index.md", DEFAULT_INDEX, "kankali: bootstrap index.md");
  return DEFAULT_INDEX;
}

export const readNoticeSchema = z.object({});

export async function toolReadNotice(cfg: GithubConfig): Promise<ToolResult> {
  const content = await ensureNotice(cfg);
  await ensureIndex(cfg);
  return ok(content, { path: "NOTICE.md", bootstrapped: true });
}

export const readIndexSchema = z.object({});

export async function toolReadIndex(cfg: GithubConfig): Promise<ToolResult> {
  await ensureNotice(cfg);
  const content = await ensureIndex(cfg);
  return ok(content, { path: "index.md" });
}

export const listTreeSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("Folder path (empty = repo root). Example: memories"),
  recursive: z
    .boolean()
    .optional()
    .describe("If true, list all files under path recursively"),
});

export async function toolListTree(
  cfg: GithubConfig,
  args: z.infer<typeof listTreeSchema>
): Promise<ToolResult> {
  const path = args.path?.trim() || "";
  if (args.recursive) {
    const tree = await listTree(cfg, path);
    if (tree.length === 0) {
      return ok(`(empty) path=${path || "/"}`, { entries: [] });
    }
    const lines = tree.map((t) => `${t.type === "tree" ? "dir " : "file"} ${t.path}`);
    return ok(lines.join("\n"), { entries: tree });
  }
  const entries = await listDir(cfg, path);
  if (entries.length === 0) {
    return ok(`(empty) path=${path || "/"}`, { entries: [] });
  }
  const lines = entries.map(
    (e) => `${e.type === "dir" ? "dir " : "file"} ${e.path}${e.size != null ? ` (${e.size}b)` : ""}`
  );
  return ok(lines.join("\n"), { entries });
}

// 4. read_outline (Table of Contents / Anchors)
export const readOutlineSchema = z.object({
  path: z.string().describe("File path relative to repo root, e.g. docs/architecture.md"),
});

export async function toolReadOutline(
  cfg: GithubConfig,
  args: z.infer<typeof readOutlineSchema>
): Promise<ToolResult> {
  let p: string;
  try {
    p = safePath(args.path);
  } catch (e) {
    return err(e instanceof Error ? e.message : "invalid path");
  }
  const file = await readFile(cfg, p);
  if (!file) return err(`File not found: ${p}`);
  const outline = extractOutline(p, file.content);
  return ok(outline, { path: p });
}

// 5. read_file (Full file or specific section chunk)
export const readFileSchema = z.object({
  path: z.string().describe("File path relative to repo root, e.g. memories/foo.md"),
  section: z
    .string()
    .optional()
    .describe("Optional anchor or heading slug (e.g. 'auth-flow' or 'Authentication') to read ONLY that chunk."),
  outline_only: z
    .boolean()
    .optional()
    .describe("If true, returns only the Table of Contents outline without the full content."),
});

export async function toolReadFile(
  cfg: GithubConfig,
  args: z.infer<typeof readFileSchema>
): Promise<ToolResult> {
  let p: string;
  try {
    p = safePath(args.path);
  } catch (e) {
    return err(e instanceof Error ? e.message : "invalid path");
  }
  const file = await readFile(cfg, p);
  if (!file) return err(`File not found: ${p}`);

  if (args.outline_only) {
    const outline = extractOutline(p, file.content);
    return ok(outline, { path: file.path, outline_only: true });
  }

  if (args.section) {
    const res = getSectionChunk(file.content, args.section);
    if (!res.found || !res.chunk) {
      const avail = res.availableAnchors?.join(", ") || "none";
      return err(`Section '${args.section}' not found in ${p}. Available sections: ${avail}`);
    }
    return ok(res.chunk, {
      path: file.path,
      section: res.section?.anchor,
      startLine: res.section?.startLine,
      endLine: res.section?.endLine,
      byteSize: res.section?.byteSize,
    });
  }

  return ok(file.content, { path: file.path, sha: file.sha, size: file.size });
}

// 6. write_file (Full file or specific section chunk)
export const writeFileSchema = z.object({
  path: z
    .string()
    .describe("File path relative to repo root. Prefer .md (e.g. memories/topic.md)"),
  content: z.string().describe("Content to write or section replacement content"),
  section: z
    .string()
    .optional()
    .describe("Optional anchor/heading slug. If provided, replaces ONLY that heading block in the document."),
  message: z.string().optional().describe("Optional git commit message"),
});

export async function toolWriteFile(
  cfg: GithubConfig,
  args: z.infer<typeof writeFileSchema>
): Promise<ToolResult> {
  let p: string;
  try {
    p = safePath(args.path);
  } catch (e) {
    return err(e instanceof Error ? e.message : "invalid path");
  }
  if (p === "NOTICE.md" && !args.content.trim()) {
    return err("NOTICE.md cannot be empty — agents depend on it.");
  }

  // Section-scoped in-place replacement
  if (args.section) {
    const existing = await readFile(cfg, p);
    if (!existing) {
      return err(`Cannot update section '${args.section}': File '${p}' does not exist.`);
    }
    const replaced = replaceSectionChunk(existing.content, args.section, args.content);
    if (!replaced.success) {
      return err(replaced.error || `Failed to replace section '${args.section}'.`);
    }
    const msg = args.message || `kankali: update section [${replaced.replacedAnchor}] in ${p}`;
    const result = await writeFile(cfg, p, replaced.updatedContent, msg);
    return ok(`Updated section [${replaced.replacedAnchor}] in ${result.path}\nsha: ${result.sha}`, {
      path: result.path,
      section: replaced.replacedAnchor,
      sha: result.sha,
    });
  }

  const result = await writeFile(cfg, p, args.content, args.message);
  return ok(`Wrote ${result.path}\nsha: ${result.sha}`, {
    path: result.path,
    sha: result.sha,
  });
}

export const deletePathSchema = z.object({
  path: z.string().describe("File or folder path to delete"),
  recursive: z
    .boolean()
    .optional()
    .describe("If true and path is a folder, delete all files under it"),
  confirm_token: z
    .string()
    .optional()
    .describe("Confirmation token required to execute deletion. Obtained by calling delete_path once without a token."),
});

export async function toolDeletePath(
  cfg: GithubConfig,
  args: z.infer<typeof deletePathSchema>,
  uid = "global"
): Promise<ToolResult> {
  let p: string;
  try {
    p = safePath(args.path);
  } catch (e) {
    return err(e instanceof Error ? e.message : "invalid path");
  }
  if (p === "NOTICE.md") {
    return err("Refusing to delete NOTICE.md — required for agents.");
  }

  // Two-step delete safety confirmation
  if (!args.confirm_token) {
    const token = createDeleteToken(p, uid);
    return ok(
      `CONFIRMATION REQUIRED: Deleting '${p}' is irreversible and cannot be undone. To confirm and execute deletion, call delete_path again with confirm_token='${token}'. Token expires in 5 minutes.`,
      {
        confirmation_required: true,
        path: p,
        confirm_token: token,
        expires_in_seconds: 300,
      }
    );
  }

  const isValid = verifyDeleteToken(args.confirm_token, p, uid);
  if (!isValid) {
    const freshToken = createDeleteToken(p, uid);
    return err(
      `Invalid or expired confirmation token for '${p}'. A fresh token was generated: '${freshToken}'. Call delete_path again with confirm_token='${freshToken}'.`
    );
  }

  const asFile = await deleteFile(cfg, p);
  if (asFile.deleted) {
    return ok(`Deleted file ${p}`, { deleted: [p] });
  }

  if (args.recursive !== false) {
    const { deleted } = await deleteFolder(cfg, p);
    if (deleted.length === 0) {
      return err(`Nothing deleted at ${p} (not found)`);
    }
    return ok(`Deleted ${deleted.length} file(s) under ${p}:\n${deleted.join("\n")}`, {
      deleted,
    });
  }

  return err(`Not a file or empty folder: ${p}. Pass recursive=true for folders.`);
}

export const searchFilesSchema = z.object({
  query: z.string().describe("Case-insensitive keyword search"),
  path_prefix: z
    .string()
    .optional()
    .describe("Only search under this folder, e.g. memories"),
  max_files: z.number().int().min(1).max(50).optional(),
});

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  }
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function toolSearchFiles(
  cfg: GithubConfig,
  args: z.infer<typeof searchFilesSchema>
): Promise<ToolResult> {
  const q = args.query.toLowerCase().trim();
  if (!q) return err("Empty query");

  const tree = await listTree(cfg, args.path_prefix || "");
  const blobs = tree
    .filter((t) => t.type === "blob")
    .filter((t) => !t.path.includes(".git/"))
    .slice(0, args.max_files ?? 40);

  const results = await mapConcurrent(blobs, 6, async (b) => {
    const file = await readFile(cfg, b.path);
    if (!file) return null;
    const lower = file.content.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx < 0) return null;
    const start = Math.max(0, idx - 40);
    const end = Math.min(file.content.length, idx + q.length + 60);
    const snippet =
      (start > 0 ? "…" : "") +
      file.content.slice(start, end).replace(/\n/g, " ") +
      (end < file.content.length ? "…" : "");
    return { path: b.path, snippet };
  });

  const hits = results.filter(
    (r): r is { path: string; snippet: string } => r !== null
  );

  if (hits.length === 0) {
    return ok(`No matches for "${args.query}"`, { hits: [], query: args.query });
  }
  const text = hits
    .map((h, i) => `${i + 1}. ${h.path}\n   ${h.snippet}`)
    .join("\n\n");
  return ok(`Found ${hits.length}:\n\n${text}`, { hits, query: args.query });
}
