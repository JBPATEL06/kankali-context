import { z } from "zod";
import YAML from "yaml";
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
} from "./drive-fs";
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

function slugify(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "project"
  );
}

function projectRoot(slug: string) {
  return `project/${slugify(slug)}`;
}

async function ensureNotice(accessToken: string): Promise<string> {
  const existing = await readFile(accessToken, "NOTICE.md");
  if (existing) return existing.content;
  await writeFile(accessToken, "NOTICE.md", DEFAULT_NOTICE);
  return DEFAULT_NOTICE;
}

async function ensureIndex(accessToken: string): Promise<string> {
  const existing = await readFile(accessToken, "index.md");
  if (existing) return existing.content;
  await writeFile(accessToken, "index.md", DEFAULT_INDEX);
  return DEFAULT_INDEX;
}

// 1. read_notice
export const readNoticeSchema = z.object({});

export async function toolReadNotice(accessToken: string): Promise<ToolResult> {
  const content = await ensureNotice(accessToken);
  await ensureIndex(accessToken);
  return ok(content, { path: "NOTICE.md", bootstrapped: true });
}

// 2. read_index
export const readIndexSchema = z.object({});

export async function toolReadIndex(accessToken: string): Promise<ToolResult> {
  await ensureNotice(accessToken);
  const content = await ensureIndex(accessToken);
  return ok(content, { path: "index.md" });
}

// 3. list_tree
export const listTreeSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("Folder path (empty = root). Example: memories"),
  recursive: z
    .boolean()
    .optional()
    .describe("If true, list all files under path recursively"),
});

export async function toolListTree(
  accessToken: string,
  args: z.infer<typeof listTreeSchema>
): Promise<ToolResult> {
  const path = args.path?.trim() || "";
  if (args.recursive) {
    const tree = await listTree(accessToken, path);
    if (tree.length === 0) {
      return ok(`(empty) path=${path || "/"}`, { entries: [] });
    }
    const lines = tree.map((t) => `${t.type === "tree" ? "dir " : "file"} ${t.path}`);
    return ok(lines.join("\n"), { entries: tree });
  }
  const entries = await listDir(accessToken, path);
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
  path: z.string().describe("File path relative to drive root, e.g. docs/architecture.md"),
});

export async function toolReadOutline(
  accessToken: string,
  args: z.infer<typeof readOutlineSchema>
): Promise<ToolResult> {
  let p: string;
  try {
    p = safePath(args.path);
  } catch (e) {
    return err(e instanceof Error ? e.message : "invalid path");
  }
  const file = await readFile(accessToken, p);
  if (!file) return err(`File not found: ${p}`);
  const outline = extractOutline(p, file.content);
  return ok(outline, { path: p });
}

// 5. read_file (Full file or specific section chunk)
export const readFileSchema = z.object({
  path: z.string().describe("File path relative to drive root, e.g. memories/foo.md"),
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
  accessToken: string,
  args: z.infer<typeof readFileSchema>
): Promise<ToolResult> {
  let p: string;
  try {
    p = safePath(args.path);
  } catch (e) {
    return err(e instanceof Error ? e.message : "invalid path");
  }
  const file = await readFile(accessToken, p);
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

  return ok(file.content, { path: file.path, updatedAt: file.updatedAt, size: file.size });
}

// 6. write_file (Full file or specific section chunk)
export const writeFileSchema = z.object({
  path: z
    .string()
    .describe("File path relative to drive root. Prefer .md (e.g. memories/topic.md)"),
  content: z.string().describe("Content to write or section replacement content"),
  section: z
    .string()
    .optional()
    .describe("Optional anchor/heading slug. If provided, replaces ONLY that heading block in the document."),
});

export async function toolWriteFile(
  accessToken: string,
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
    const existing = await readFile(accessToken, p);
    if (!existing) {
      return err(`Cannot update section '${args.section}': File '${p}' does not exist.`);
    }
    const replaced = replaceSectionChunk(existing.content, args.section, args.content);
    if (!replaced.success) {
      return err(replaced.error || `Failed to replace section '${args.section}'.`);
    }
    const result = await writeFile(accessToken, p, replaced.updatedContent);
    return ok(
      `Updated section [${replaced.replacedAnchor}] in ${result.path}\nupdatedAt: ${result.updatedAt}`,
      {
        path: result.path,
        section: replaced.replacedAnchor,
        updatedAt: result.updatedAt,
      }
    );
  }

  const result = await writeFile(accessToken, p, args.content);
  return ok(`Wrote ${result.path}\nupdatedAt: ${result.updatedAt}`, {
    path: result.path,
    updatedAt: result.updatedAt,
  });
}

// 6. delete_path
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
  accessToken: string,
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

  const asFile = await deleteFile(accessToken, p);
  if (asFile.deleted) {
    return ok(`Deleted file ${p}`, { deleted: [p] });
  }

  if (args.recursive !== false) {
    const { deleted } = await deleteFolder(accessToken, p);
    if (deleted.length === 0) {
      return err(`Nothing deleted at ${p} (not found)`);
    }
    return ok(`Deleted ${deleted.length} file(s) under ${p}:\n${deleted.join("\n")}`, {
      deleted,
    });
  }

  return err(`Not a file or empty folder: ${p}. Pass recursive=true for folders.`);
}

// 7. search_files
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
  accessToken: string,
  args: z.infer<typeof searchFilesSchema>
): Promise<ToolResult> {
  const q = args.query.toLowerCase().trim();
  if (!q) return err("Empty query");

  const tree = await listTree(accessToken, args.path_prefix || "");
  const blobs = tree
    .filter((t) => t.type === "blob")
    .slice(0, args.max_files ?? 40);

  const results = await mapConcurrent(blobs, 6, async (b) => {
    const file = await readFile(accessToken, b.path);
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

// 8. project_upsert
export const projectUpsertSchema = z.object({
  slug: z.string().describe("Project slug, e.g. kankali, ai-manager"),
  name: z.string().optional(),
  stack: z.string().optional(),
  status: z.string().optional().describe("e.g. active, paused, done"),
  repo_url: z.string().optional(),
  summary: z.string().optional(),
  key_decisions: z.array(z.string()).optional(),
});

export async function toolProjectUpsert(
  accessToken: string,
  args: z.infer<typeof projectUpsertSchema>
): Promise<ToolResult> {
  const slug = slugify(args.slug);
  const root = projectRoot(slug);
  const now = new Date().toISOString();
  const name = args.name || slug;

  const statusBody = `---
name: ${JSON.stringify(name)}
slug: ${slug}
stack: ${JSON.stringify(args.stack || "")}
status: ${JSON.stringify(args.status || "active")}
repo_url: ${JSON.stringify(args.repo_url || "")}
updated_at: ${now}
---

${args.summary?.trim() || `Project **${name}** — status snapshot.`}
`;

  const decisions =
    args.key_decisions && args.key_decisions.length
      ? args.key_decisions.map((d) => `- ${d}`).join("\n")
      : "_No key decisions recorded yet._";

  const overviewBody = `# ${name}

| Field | Value |
|-------|-------|
| Slug | \`${slug}\` |
| Stack | ${args.stack || "—"} |
| Status | ${args.status || "active"} |
| Repo | ${args.repo_url || "—"} |
| Updated | ${now} |

## Summary

${args.summary?.trim() || "_No summary yet._"}

## Key decisions

${decisions}
`;

  const planBody = `# ${name} Roadmap & Plan

## Current Milestone
- [ ] Initial project setup and core architecture.

## Upcoming Phases
- Phase 1: Core components and foundational logic.
- Phase 2: Feature integrations and testing.
`;

  const auditBody = `# ${name} Audit & Quality Log

| Date | Category | Findings & Recommendations | Status |
|------|----------|----------------------------|--------|
| ${now.slice(0, 10)} | Initial | Project baseline established | OK |
`;

  const keepCodebase = `# Codebase notes — ${name}

Technical reference only (structure, signatures, patterns).  
Use \`project_codebase_note\` to add files here. Do not put product narrative in this folder.
`;

  const keepResources = `# Resources — ${name}

User-facing links, API documentation, design assets, and external references.
`;

  const s = await writeFile(accessToken, `${root}/status.md`, statusBody);
  const o = await writeFile(accessToken, `${root}/docs/overview.md`, overviewBody);
  const p = await writeFile(accessToken, `${root}/docs/plan.md`, planBody);
  const a = await writeFile(accessToken, `${root}/docs/audit.md`, auditBody);
  const c = await writeFile(accessToken, `${root}/codebase/README.md`, keepCodebase);
  const r = await writeFile(accessToken, `${root}/resources/README.md`, keepResources);

  return ok(
    `Project upserted: ${slug}\n- ${s.path}\n- ${o.path}\n- ${p.path}\n- ${a.path}\n- ${c.path}\n- ${r.path}`,
    { slug, paths: [s.path, o.path, p.path, a.path, c.path, r.path] }
  );
}

// 9. project_codebase_note
export const projectCodebaseNoteSchema = z.object({
  slug: z.string(),
  note: z.string().describe("Technical note content (markdown)"),
  path: z
    .string()
    .optional()
    .describe("Filename under codebase/, e.g. mcp-routes.md"),
});

export async function toolProjectCodebaseNote(
  accessToken: string,
  args: z.infer<typeof projectCodebaseNoteSchema>
): Promise<ToolResult> {
  const slug = slugify(args.slug);
  let fileName = args.path?.trim() || "notes.md";
  fileName = fileName.replace(/^\/+/, "").replace(/\.\./g, "");
  if (!fileName.includes(".")) fileName += ".md";
  const path = safePath(`${projectRoot(slug)}/codebase/${fileName}`);
  const result = await writeFile(accessToken, path, args.note);
  return ok(`Wrote ${result.path}`, { path: result.path, updatedAt: result.updatedAt });
}

// 10. project_get
export const projectGetSchema = z.object({
  slug: z.string(),
  section: z
    .enum(["status", "docs", "codebase", "resources", "all"])
    .optional()
    .describe("Scope of context to retrieve: status | docs | codebase | resources | all (default: all)"),
});

export async function toolProjectGet(
  accessToken: string,
  args: z.infer<typeof projectGetSchema>
): Promise<ToolResult> {
  const slug = slugify(args.slug);
  const root = projectRoot(slug);
  const section = args.section || "all";

  const status = await readFile(accessToken, `${root}/status.md`);
  if (!status) {
    return err(`Project not found: ${slug}. Use project_upsert to create it.`);
  }

  const parts: string[] = [];

  if (section === "status" || section === "all") {
    parts.push(`## status.md\n\n${status.content}`);
  }

  if (section === "docs" || section === "all") {
    const docs = await listDir(accessToken, `${root}/docs`);
    const overview = await readFile(accessToken, `${root}/docs/overview.md`);
    const plan = await readFile(accessToken, `${root}/docs/plan.md`);
    const audit = await readFile(accessToken, `${root}/docs/audit.md`);

    if (overview) parts.push(`## docs/overview.md\n\n${overview.content}`);
    if (plan) parts.push(`## docs/plan.md\n\n${plan.content}`);
    if (audit) parts.push(`## docs/audit.md\n\n${audit.content}`);
    parts.push(`## docs/ files\n${docs.map((d) => `- ${d.path}`).join("\n") || "(empty)"}`);
  }

  if (section === "codebase" || section === "all") {
    const code = await listDir(accessToken, `${root}/codebase`);
    parts.push(`## codebase/ files\n${code.map((d) => `- ${d.path}`).join("\n") || "(empty)"}`);
  }

  if (section === "resources" || section === "all") {
    const resources = await listDir(accessToken, `${root}/resources`);
    parts.push(`## resources/ files\n${resources.map((d) => `- ${d.path}`).join("\n") || "(empty)"}`);
  }

  return ok(parts.join("\n\n"), {
    slug,
    section,
  });
}

// 11. project_list
export const projectListSchema = z.object({});

export async function toolProjectList(accessToken: string): Promise<ToolResult> {
  const entries = await listDir(accessToken, "project");
  const dirs = entries.filter((e) => e.type === "dir");
  if (dirs.length === 0) {
    return ok("No projects yet. Use project_upsert to create one.", { projects: [] });
  }
  const lines: string[] = [];
  const projects: Array<{ slug: string; status?: string }> = [];
  for (const d of dirs) {
    const slug = d.name;
    const st = await readFile(accessToken, `project/${slug}/status.md`);
    let one = slug;
    if (st) {
      const match = st.content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      let name = slug;
      let status = "active";
      if (match) {
        try {
          const parsed = YAML.parse(match[1]) as Record<string, unknown>;
          if (parsed && typeof parsed === "object") {
            if (typeof parsed.name === "string") name = parsed.name;
            if (typeof parsed.status === "string") status = parsed.status;
          }
        } catch {
          // fallback to defaults if YAML parse fails
        }
      }
      one = `${slug} — ${name} [${status}]`.replace(/\s+/g, " ").trim();
    }
    lines.push(`- ${one}`);
    projects.push({ slug, status: one });
  }
  return ok(`Projects:\n${lines.join("\n")}`, { projects });
}

// 12. current_session_set & current_session_get
const SESSION_PATH = "session/current.md";

export const currentSessionSetSchema = z.object({
  what: z.string().describe("Current goal/task in one line"),
  blocker: z.string().optional().describe("Active blocker, if any"),
  note: z
    .string()
    .optional()
    .describe("Short curated narrative (not a transcript)"),
  origin: z
    .string()
    .optional()
    .describe("claude | grok | user"),
});

export async function toolCurrentSessionSet(
  accessToken: string,
  args: z.infer<typeof currentSessionSetSchema>
): Promise<ToolResult> {
  const now = new Date().toISOString();
  const origin = (args.origin || "user").toLowerCase();
  const blocker = args.blocker?.trim() || "null";
  const note =
    args.note?.trim() ||
    "_No additional narrative._";

  const body = `---
what: ${JSON.stringify(args.what.trim())}
blocker: ${blocker === "null" ? "null" : JSON.stringify(blocker)}
last_touched_by: ${origin}
updated_at: ${now}
---

${note}
`;

  const result = await writeFile(accessToken, SESSION_PATH, body);
  return ok(
    `Session updated.\nwhat: ${args.what.trim()}\nblocker: ${blocker}\npath: ${result.path}`,
    {
      path: result.path,
      what: args.what.trim(),
      blocker: blocker === "null" ? null : blocker,
      last_touched_by: origin,
      updated_at: now,
    }
  );
}

export const currentSessionGetSchema = z.object({});

export async function toolCurrentSessionGet(
  accessToken: string
): Promise<ToolResult> {
  const file = await readFile(accessToken, SESSION_PATH);
  if (!file) {
    return ok("No current session stored. (session/current.md missing)", {
      empty: true,
      path: SESSION_PATH,
    });
  }
  return ok(file.content, { path: SESSION_PATH, empty: false });
}
