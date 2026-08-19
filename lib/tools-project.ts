import { z } from "zod";
import YAML from "yaml";
import type { GithubConfig } from "@/types";
import { listDir, readFile, writeFile, safePath } from "./git-fs";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

function ok(text: string, structured?: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured };
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
  cfg: GithubConfig,
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

  const s = await writeFile(cfg, `${root}/status.md`, statusBody, `kankali: project upsert ${slug}`);
  const o = await writeFile(
    cfg,
    `${root}/docs/overview.md`,
    overviewBody,
    `kankali: project docs overview ${slug}`
  );
  const p = await writeFile(
    cfg,
    `${root}/docs/plan.md`,
    planBody,
    `kankali: project docs plan ${slug}`
  );
  const a = await writeFile(
    cfg,
    `${root}/docs/audit.md`,
    auditBody,
    `kankali: project docs audit ${slug}`
  );
  const c = await writeFile(
    cfg,
    `${root}/codebase/README.md`,
    keepCodebase,
    `kankali: ensure codebase dir ${slug}`
  );
  const r = await writeFile(
    cfg,
    `${root}/resources/README.md`,
    keepResources,
    `kankali: ensure resources dir ${slug}`
  );

  return ok(
    `Project upserted: ${slug}\n- ${s.path}\n- ${o.path}\n- ${p.path}\n- ${a.path}\n- ${c.path}\n- ${r.path}`,
    { slug, paths: [s.path, o.path, p.path, a.path, c.path, r.path] }
  );
}

export const projectCodebaseNoteSchema = z.object({
  slug: z.string(),
  note: z.string().describe("Technical note content (markdown)"),
  path: z
    .string()
    .optional()
    .describe("Filename under codebase/, e.g. mcp-routes.md"),
});

export async function toolProjectCodebaseNote(
  cfg: GithubConfig,
  args: z.infer<typeof projectCodebaseNoteSchema>
): Promise<ToolResult> {
  const slug = slugify(args.slug);
  let fileName = args.path?.trim() || "notes.md";
  fileName = fileName.replace(/^\/+/, "").replace(/\.\./g, "");
  if (!fileName.includes(".")) fileName += ".md";
  const path = safePath(`${projectRoot(slug)}/codebase/${fileName}`);
  const result = await writeFile(
    cfg,
    path,
    args.note,
    `kankali: codebase note ${slug}/${fileName}`
  );
  return ok(`Wrote ${result.path}`, { path: result.path, sha: result.sha });
}

export const projectGetSchema = z.object({
  slug: z.string(),
  section: z
    .enum(["status", "docs", "codebase", "resources", "all"])
    .optional()
    .describe("Scope of context to retrieve: status | docs | codebase | resources | all (default: all)"),
});

export async function toolProjectGet(
  cfg: GithubConfig,
  args: z.infer<typeof projectGetSchema>
): Promise<ToolResult> {
  const slug = slugify(args.slug);
  const root = projectRoot(slug);
  const section = args.section || "all";

  const status = await readFile(cfg, `${root}/status.md`);
  if (!status) {
    return err(`Project not found: ${slug}. Use project_upsert to create it.`);
  }

  const parts: string[] = [];

  if (section === "status" || section === "all") {
    parts.push(`## status.md\n\n${status.content}`);
  }

  if (section === "docs" || section === "all") {
    const docs = await listDir(cfg, `${root}/docs`);
    const overview = await readFile(cfg, `${root}/docs/overview.md`);
    const plan = await readFile(cfg, `${root}/docs/plan.md`);
    const audit = await readFile(cfg, `${root}/docs/audit.md`);

    if (overview) parts.push(`## docs/overview.md\n\n${overview.content}`);
    if (plan) parts.push(`## docs/plan.md\n\n${plan.content}`);
    if (audit) parts.push(`## docs/audit.md\n\n${audit.content}`);
    parts.push(`## docs/ files\n${docs.map((d) => `- ${d.path}`).join("\n") || "(empty)"}`);
  }

  if (section === "codebase" || section === "all") {
    const code = await listDir(cfg, `${root}/codebase`);
    parts.push(`## codebase/ files\n${code.map((d) => `- ${d.path}`).join("\n") || "(empty)"}`);
  }

  if (section === "resources" || section === "all") {
    const resources = await listDir(cfg, `${root}/resources`);
    parts.push(`## resources/ files\n${resources.map((d) => `- ${d.path}`).join("\n") || "(empty)"}`);
  }

  return ok(parts.join("\n\n"), {
    slug,
    section,
  });
}

export const projectListSchema = z.object({});

export async function toolProjectList(cfg: GithubConfig): Promise<ToolResult> {
  const entries = await listDir(cfg, "project");
  const dirs = entries.filter((e) => e.type === "dir");
  if (dirs.length === 0) {
    return ok("No projects yet. Use project_upsert to create one.", { projects: [] });
  }
  const lines: string[] = [];
  const projects: Array<{ slug: string; status?: string }> = [];
  for (const d of dirs) {
    const slug = d.name;
    const st = await readFile(cfg, `project/${slug}/status.md`);
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
