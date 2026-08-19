import { z } from "zod";
import type { GithubConfig } from "@/types";
import { readFile, writeFile } from "./git-fs";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

function ok(text: string, structured?: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured };
}

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
  cfg: GithubConfig,
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

  const result = await writeFile(
    cfg,
    SESSION_PATH,
    body,
    "kankali: current_session_set"
  );
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
  cfg: GithubConfig
): Promise<ToolResult> {
  const file = await readFile(cfg, SESSION_PATH);
  if (!file) {
    return ok("No current session stored. (session/current.md missing)", {
      empty: true,
      path: SESSION_PATH,
    });
  }
  return ok(file.content, { path: SESSION_PATH, empty: false });
}
