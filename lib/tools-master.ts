import { z } from "zod";
import type { GithubConfig } from "@/types";
import {
  toolReadIndex as gitReadIndex,
  toolListTree as gitListTree,
  toolReadOutline as gitReadOutline,
  toolReadFile as gitReadFile,
  toolWriteFile as gitWriteFile,
  toolDeletePath as gitDeletePath,
  toolSearchFiles as gitSearchFiles,
} from "@/lib/tools-git";
import {
  toolProjectUpsert as gitProjectUpsert,
  toolProjectCodebaseNote as gitProjectCodebaseNote,
  toolProjectGet as gitProjectGet,
  toolProjectList as gitProjectList,
} from "@/lib/tools-project";
import {
  toolCurrentSessionSet as gitCurrentSessionSet,
  toolCurrentSessionGet as gitCurrentSessionGet,
} from "@/lib/tools-session";
import {
  toolReadIndex as driveReadIndex,
  toolListTree as driveListTree,
  toolReadOutline as driveReadOutline,
  toolReadFile as driveReadFile,
  toolWriteFile as driveWriteFile,
  toolDeletePath as driveDeletePath,
  toolSearchFiles as driveSearchFiles,
  toolProjectUpsert as driveProjectUpsert,
  toolProjectCodebaseNote as driveProjectCodebaseNote,
  toolProjectGet as driveProjectGet,
  toolProjectList as driveProjectList,
  toolCurrentSessionSet as driveCurrentSessionSet,
  toolCurrentSessionGet as driveCurrentSessionGet,
} from "@/lib/tools-drive";

export interface MasterContext {
  gitCfg: GithubConfig | null;
  driveToken: string | null;
  uid: string;
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: "text", text }], isError };
}

export const targetSchema = z
  .enum(["drive", "git", "both"])
  .optional()
  .describe("Target storage vault: 'drive' (Google Drive), 'git' (GitHub), or 'both'.");

// 1. Notice
export const masterReadNoticeSchema = z.object({});
export async function toolMasterReadNotice(): Promise<ToolResult> {
  const text = `# NOTICE — Kankali Master Unified Vault (Dual Cloud: Google Drive + GitHub)

You are connected to Kankali Master Vault (\`/mcp/master\`), which manages BOTH **Google Drive App Data** and **GitHub Storage Vault**.

## Progressive Disclosure & Chunk Reading (Token Efficiency):
- For large documents (>10 KB), call \`read_outline(path)\` to inspect the Table of Contents & Anchors (\`## [anchor] Section Title\`).
- Use \`read_file(path, section: "<anchor>")\` to read ONLY that specific heading block (~1-3 KB instead of the full file).
- Use \`write_file(path, content, section: "<anchor>")\` to replace ONLY that specific section block in-place.

## Target Storage Directive
Every tool accepts an optional \`target\` argument:
- \`target: "drive"\` — Google Drive App Data (fast, invisible, private).
- \`target: "git"\` — GitHub Repository (versioned, commits, team visibility).
- \`target: "both"\` — Synchronize across both clouds simultaneously (default for durable facts and project creation).

## AI Prompt Rule:
- If the user specifies "on GitHub" or "in repo" -> use \`target: "git"\`.
- If the user specifies "on Drive" or "quick scratchpad" -> use \`target: "drive"\`.
- If the user says "both" or does not specify -> use \`target: "both"\` for project creation/session, or primary for reads.

## Mandatory Flow:
1. **read_notice** (this file) — required every session first.
2. **read_index** — map of paths across vaults.
3. **current_session_get** — what's live right now.
4. Then use FS / project / session tools with \`target: "drive" | "git" | "both"\`.

## Available Tools:
\`read_notice\` · \`read_index\` · \`read_outline\` · \`list_tree\` · \`read_file\` · \`write_file\` · \`delete_path\` · \`search_files\` · \`project_upsert\` · \`project_codebase_note\` · \`project_get\` · \`project_list\` · \`current_session_set\` · \`current_session_get\`
`;
  return textResult(text);
}

// 2. Read Index
export const masterReadIndexSchema = z.object({
  target: z.enum(["drive", "git"]).optional().describe("Vault to read index from."),
});
export async function toolMasterReadIndex(
  ctx: MasterContext,
  args: z.infer<typeof masterReadIndexSchema>
): Promise<ToolResult> {
  if (args.target === "git" && ctx.gitCfg) {
    return gitReadIndex(ctx.gitCfg);
  }
  if (ctx.driveToken) {
    return driveReadIndex(ctx.driveToken);
  }
  if (ctx.gitCfg) {
    return gitReadIndex(ctx.gitCfg);
  }
  return textResult("No connected vault available (neither Google Drive nor GitHub is linked).", true);
}

// 3. Read Outline (TOC / Anchors)
export const masterReadOutlineSchema = z.object({
  path: z.string().min(1).describe("File path to inspect outline, e.g. docs/architecture.md"),
  target: z.enum(["drive", "git"]).optional().describe("Vault to inspect."),
});
export async function toolMasterReadOutline(
  ctx: MasterContext,
  args: z.infer<typeof masterReadOutlineSchema>
): Promise<ToolResult> {
  if (args.target === "git" && ctx.gitCfg) {
    return gitReadOutline(ctx.gitCfg, args);
  }
  if (args.target === "drive" && ctx.driveToken) {
    return driveReadOutline(ctx.driveToken, args);
  }
  if (ctx.driveToken) {
    const dRes = await driveReadOutline(ctx.driveToken, args);
    if (!dRes.isError) return dRes;
  }
  if (ctx.gitCfg) {
    return gitReadOutline(ctx.gitCfg, args);
  }
  return textResult(`Could not read outline for '${args.path}' from connected vaults.`, true);
}

// 4. List Tree
export const masterListTreeSchema = z.object({
  path: z.string().optional().default("").describe("Directory prefix to list."),
  recursive: z.boolean().optional().default(false).describe("List all files recursively."),
  target: targetSchema,
});
export async function toolMasterListTree(
  ctx: MasterContext,
  args: z.infer<typeof masterListTreeSchema>
): Promise<ToolResult> {
  const target = args.target || (ctx.driveToken ? "drive" : "git");
  const outputs: string[] = [];

  if ((target === "drive" || target === "both") && ctx.driveToken) {
    const dRes = await driveListTree(ctx.driveToken, args);
    const dText = dRes.content.map((c) => c.text).join("\n");
    outputs.push(`[Google Drive Vault]:\n${dText}`);
  }
  if ((target === "git" || target === "both") && ctx.gitCfg) {
    const gRes = await gitListTree(ctx.gitCfg, args);
    const gText = gRes.content.map((c) => c.text).join("\n");
    outputs.push(`[GitHub Vault]:\n${gText}`);
  }

  if (outputs.length === 0) {
    return textResult(`Target vault '${target}' is not configured or linked.`, true);
  }
  return textResult(outputs.join("\n\n"));
}

// 5. Read File (Whole or Section Chunk)
export const masterReadFileSchema = z.object({
  path: z.string().min(1).describe("Path of file to read."),
  section: z
    .string()
    .optional()
    .describe("Optional anchor or heading slug (e.g. 'auth-flow' or 'Authentication') to read ONLY that chunk."),
  outline_only: z
    .boolean()
    .optional()
    .describe("If true, returns only the Table of Contents outline without full content."),
  target: z.enum(["drive", "git"]).optional().describe("Target vault to read from."),
});
export async function toolMasterReadFile(
  ctx: MasterContext,
  args: z.infer<typeof masterReadFileSchema>
): Promise<ToolResult> {
  if (args.target === "git" && ctx.gitCfg) {
    return gitReadFile(ctx.gitCfg, args);
  }
  if (args.target === "drive" && ctx.driveToken) {
    return driveReadFile(ctx.driveToken, args);
  }

  // Auto-fallback: Try Drive first, then Git
  if (ctx.driveToken) {
    const dRes = await driveReadFile(ctx.driveToken, args);
    if (!dRes.isError) return dRes;
  }
  if (ctx.gitCfg) {
    return gitReadFile(ctx.gitCfg, args);
  }
  return textResult(`File '${args.path}' could not be read from connected vaults.`, true);
}

// 6. Write File (Whole or Section Chunk)
export const masterWriteFileSchema = z.object({
  path: z.string().min(1).describe("Path to write to."),
  content: z.string().describe("Content to write or section replacement content."),
  section: z
    .string()
    .optional()
    .describe("Optional anchor/heading slug. If provided, replaces ONLY that heading block in the document."),
  target: targetSchema,
});
export async function toolMasterWriteFile(
  ctx: MasterContext,
  args: z.infer<typeof masterWriteFileSchema>
): Promise<ToolResult> {
  const target = args.target || "both";
  const messages: string[] = [];

  if ((target === "drive" || target === "both") && ctx.driveToken) {
    const dRes = await driveWriteFile(ctx.driveToken, { path: args.path, content: args.content, section: args.section });
    messages.push(`Drive: ${dRes.content.map((c) => c.text).join(" ")}`);
  }
  if ((target === "git" || target === "both") && ctx.gitCfg) {
    const gRes = await gitWriteFile(ctx.gitCfg, { path: args.path, content: args.content, section: args.section });
    messages.push(`GitHub: ${gRes.content.map((c) => c.text).join(" ")}`);
  }

  if (messages.length === 0) {
    return textResult(`Could not write to '${target}': No matching vault configured.`, true);
  }
  return textResult(messages.join(" | "));
}

// 7. Delete Path (Two-step confirmation)
export const masterDeletePathSchema = z.object({
  path: z.string().min(1).describe("Path of file or folder to delete."),
  confirm_token: z.string().optional().describe("HMAC confirmation token required for deletion."),
  target: targetSchema,
});
export async function toolMasterDeletePath(
  ctx: MasterContext,
  args: z.infer<typeof masterDeletePathSchema>
): Promise<ToolResult> {
  const target = args.target || "both";
  const messages: string[] = [];

  if ((target === "drive" || target === "both") && ctx.driveToken) {
    const dRes = await driveDeletePath(ctx.driveToken, args, ctx.uid);
    messages.push(`Drive: ${dRes.content.map((c) => c.text).join(" ")}`);
  }
  if ((target === "git" || target === "both") && ctx.gitCfg) {
    const gRes = await gitDeletePath(ctx.gitCfg, args, ctx.uid);
    messages.push(`GitHub: ${gRes.content.map((c) => c.text).join(" ")}`);
  }

  if (messages.length === 0) {
    return textResult(`Target vault '${target}' is not configured.`, true);
  }
  return textResult(messages.join("\n"));
}

// 7. Search Files
export const masterSearchFilesSchema = z.object({
  query: z.string().min(1).describe("Term to search for in filenames and content."),
  target: targetSchema,
});
export async function toolMasterSearchFiles(
  ctx: MasterContext,
  args: z.infer<typeof masterSearchFilesSchema>
): Promise<ToolResult> {
  const target = args.target || (ctx.driveToken ? "drive" : "git");
  const outputs: string[] = [];

  if ((target === "drive" || target === "both") && ctx.driveToken) {
    const dRes = await driveSearchFiles(ctx.driveToken, args);
    outputs.push(`[Google Drive Results]:\n${dRes.content.map((c) => c.text).join("\n")}`);
  }
  if ((target === "git" || target === "both") && ctx.gitCfg) {
    const gRes = await gitSearchFiles(ctx.gitCfg, args);
    outputs.push(`[GitHub Results]:\n${gRes.content.map((c) => c.text).join("\n")}`);
  }

  return textResult(outputs.join("\n\n") || `No matches found for '${args.query}'.`);
}

// 8. Project Upsert
export const masterProjectUpsertSchema = z.object({
  slug: z.string().min(1).describe("Lowercase identifier, e.g. 'kankali'"),
  name: z.string().optional().describe("Display name"),
  stack: z.string().optional().describe("Languages, frameworks, databases"),
  status: z.string().optional().describe("active | in-progress | maintenance"),
  repo_url: z.string().optional().describe("Repository URL if applicable"),
  summary: z.string().optional().describe("1-2 line description"),
  key_decisions: z.array(z.string()).optional().describe("Important architectural decisions"),
  target: targetSchema,
});
export async function toolMasterProjectUpsert(
  ctx: MasterContext,
  args: z.infer<typeof masterProjectUpsertSchema>
): Promise<ToolResult> {
  const target = args.target || "both";
  const messages: string[] = [];

  if ((target === "drive" || target === "both") && ctx.driveToken) {
    const dRes = await driveProjectUpsert(ctx.driveToken, args);
    messages.push(`[Google Drive]:\n${dRes.content.map((c) => c.text).join("\n")}`);
  }
  if ((target === "git" || target === "both") && ctx.gitCfg) {
    const gRes = await gitProjectUpsert(ctx.gitCfg, args);
    messages.push(`[GitHub]:\n${gRes.content.map((c) => c.text).join("\n")}`);
  }

  if (messages.length === 0) {
    return textResult("No vault configured to upsert project.", true);
  }
  return textResult(messages.join("\n\n"));
}

// 9. Project Codebase Note
export const masterProjectCodebaseNoteSchema = z.object({
  slug: z.string().min(1).describe("Project slug, e.g. 'kankali'"),
  note: z.string().min(1).describe("Technical note markdown content"),
  path: z.string().optional().describe("Filename under codebase/, e.g. 'mcp-routes.md'"),
  target: targetSchema,
});
export async function toolMasterProjectCodebaseNote(
  ctx: MasterContext,
  args: z.infer<typeof masterProjectCodebaseNoteSchema>
): Promise<ToolResult> {
  const target = args.target || "both";
  const messages: string[] = [];

  if ((target === "drive" || target === "both") && ctx.driveToken) {
    const dRes = await driveProjectCodebaseNote(ctx.driveToken, args);
    messages.push(`Drive: ${dRes.content.map((c) => c.text).join(" ")}`);
  }
  if ((target === "git" || target === "both") && ctx.gitCfg) {
    const gRes = await gitProjectCodebaseNote(ctx.gitCfg, args);
    messages.push(`GitHub: ${gRes.content.map((c) => c.text).join(" ")}`);
  }

  return textResult(messages.join(" | "));
}

// 10. Project Get
export const masterProjectGetSchema = z.object({
  slug: z.string().min(1),
  section: z.enum(["status", "docs", "codebase", "resources", "all"]).optional().default("all"),
  target: z.enum(["drive", "git"]).optional(),
});
export async function toolMasterProjectGet(
  ctx: MasterContext,
  args: z.infer<typeof masterProjectGetSchema>
): Promise<ToolResult> {
  if (args.target === "git" && ctx.gitCfg) {
    return gitProjectGet(ctx.gitCfg, args);
  }
  if (args.target === "drive" && ctx.driveToken) {
    return driveProjectGet(ctx.driveToken, args);
  }

  if (ctx.driveToken) {
    const dRes = await driveProjectGet(ctx.driveToken, args);
    if (!dRes.isError) return dRes;
  }
  if (ctx.gitCfg) {
    return gitProjectGet(ctx.gitCfg, args);
  }
  return textResult(`Project '${args.slug}' could not be found.`, true);
}

// 11. Project List
export const masterProjectListSchema = z.object({
  target: targetSchema,
});
export async function toolMasterProjectList(
  ctx: MasterContext,
  args: z.infer<typeof masterProjectListSchema>
): Promise<ToolResult> {
  const target = args.target || (ctx.driveToken ? "drive" : "git");
  const outputs: string[] = [];

  if ((target === "drive" || target === "both") && ctx.driveToken) {
    const dRes = await driveProjectList(ctx.driveToken);
    outputs.push(`[Google Drive Projects]:\n${dRes.content.map((c) => c.text).join("\n")}`);
  }
  if ((target === "git" || target === "both") && ctx.gitCfg) {
    const gRes = await gitProjectList(ctx.gitCfg);
    outputs.push(`[GitHub Projects]:\n${gRes.content.map((c) => c.text).join("\n")}`);
  }

  return textResult(outputs.join("\n\n") || "No projects found.");
}

// 12. Current Session Set
export const masterCurrentSessionSetSchema = z.object({
  what: z.string().min(1).describe("1-3 lines: what is active/being worked on now"),
  blocker: z.string().optional().describe("Any current blockers"),
  note: z.string().optional().describe("Short context note for the next turn"),
  origin: z.string().optional().default("claude"),
  target: targetSchema,
});
export async function toolMasterCurrentSessionSet(
  ctx: MasterContext,
  args: z.infer<typeof masterCurrentSessionSetSchema>
): Promise<ToolResult> {
  const target = args.target || "both";
  const messages: string[] = [];

  if ((target === "drive" || target === "both") && ctx.driveToken) {
    const dRes = await driveCurrentSessionSet(ctx.driveToken, args);
    messages.push(`Drive: ${dRes.content.map((c) => c.text).join(" ")}`);
  }
  if ((target === "git" || target === "both") && ctx.gitCfg) {
    const gRes = await gitCurrentSessionSet(ctx.gitCfg, args);
    messages.push(`GitHub: ${gRes.content.map((c) => c.text).join(" ")}`);
  }

  return textResult(messages.join(" | "));
}

// 13. Current Session Get
export const masterCurrentSessionGetSchema = z.object({
  target: z.enum(["drive", "git"]).optional(),
});
export async function toolMasterCurrentSessionGet(
  ctx: MasterContext,
  args: z.infer<typeof masterCurrentSessionGetSchema>
): Promise<ToolResult> {
  if (args.target === "git" && ctx.gitCfg) {
    return gitCurrentSessionGet(ctx.gitCfg);
  }
  if (args.target === "drive" && ctx.driveToken) {
    return driveCurrentSessionGet(ctx.driveToken);
  }

  if (ctx.driveToken) {
    const dRes = await driveCurrentSessionGet(ctx.driveToken);
    if (!dRes.isError) return dRes;
  }
  if (ctx.gitCfg) {
    return gitCurrentSessionGet(ctx.gitCfg);
  }
  return textResult("No active session found.", true);
}
