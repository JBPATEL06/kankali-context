/**
 * Multi-user MCP endpoint.
 * Auth: Bearer / X-API-Key = user's mcpApiKey from Firestore.
 * GitHub ops use that user's encrypted PAT.
 */

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getUserByMcpKey, resolveGithubConfig } from "@/lib/users";
import {
  listDomainsSchema,
  toolListDomains,
  readContextSchema,
  toolReadContext,
  writeContextSchema,
  toolWriteContext,
  searchContextSchema,
  toolSearchContext,
} from "@/lib/tools";
import type { GithubConfig, Origin, UserRecord } from "@/types";

export const maxDuration = 30;

let currentRequest: Request | null = null;
let currentUser: UserRecord | null = null;
let currentCfg: GithubConfig | null = null;

function extractApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key")?.trim() || null;
}

async function resolveCaller(req: Request): Promise<{
  user: UserRecord;
  cfg: GithubConfig;
}> {
  const key = extractApiKey(req);
  if (!key) {
    throw new Error(
      "Unauthorized: pass your Kankali MCP API key as Authorization: Bearer <key> or X-API-Key."
    );
  }
  const user = await getUserByMcpKey(key);
  if (!user) {
    throw new Error("Unauthorized: invalid MCP API key.");
  }
  const cfg = resolveGithubConfig(user);
  if (!cfg) {
    throw new Error(
      "GitHub not connected. Sign in at the Kankali dashboard and save your GitHub token + repo under Settings."
    );
  }
  // Soft warning if expired
  if (user.tokenExpiresAt && Date.parse(user.tokenExpiresAt) < Date.now()) {
    throw new Error(
      "Your GitHub token has expired. Update it in the Kankali Settings page."
    );
  }
  return { user, cfg };
}

function withUser<T extends z.ZodTypeAny>(
  schema: T,
  fn: (
    cfg: GithubConfig,
    args: z.infer<T>,
    user: UserRecord
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  }>
) {
  return async (args: z.infer<T>) => {
    try {
      if (!currentCfg || !currentUser) {
        return {
          content: [{ type: "text" as const, text: "Internal: no request context" }],
          isError: true,
        };
      }
      return await fn(currentCfg, args, currentUser);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: message }],
        isError: true,
        structuredContent: { error: message },
      };
    }
  };
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    "list_domains",
    {
      description: "List context domains under /domains/ in the user's GitHub repo.",
      inputSchema: listDomainsSchema.shape,
    },
    withUser(listDomainsSchema, async (cfg) => toolListDomains(cfg))
  );

  server.registerTool(
    "read_context",
    {
      description: "Read stored context for a domain from the user's GitHub repo.",
      inputSchema: readContextSchema.shape,
    },
    withUser(readContextSchema, async (cfg, args) => toolReadContext(cfg, args))
  );

  server.registerTool(
    "write_context",
    {
      description:
        "Write context for a domain into the user's GitHub repo. Origin optional (claude|grok|user).",
      inputSchema: writeContextSchema.shape,
    },
    withUser(writeContextSchema, async (cfg, args) =>
      toolWriteContext(cfg, args, "user" as Origin)
    )
  );

  server.registerTool(
    "search_context",
    {
      description: "Keyword search across the user's stored markdown context files.",
      inputSchema: searchContextSchema.shape,
    },
    withUser(searchContextSchema, async (cfg, args) => toolSearchContext(cfg, args))
  );
});

async function wrappedHandler(req: Request): Promise<Response> {
  currentRequest = req;
  currentUser = null;
  currentCfg = null;
  try {
    // Resolve auth early so initialize + tools all share context
    try {
      const resolved = await resolveCaller(req);
      currentUser = resolved.user;
      currentCfg = resolved.cfg;
    } catch (err) {
      // For protocol handshake methods without auth, mcp-handler still needs a response.
      // Tool calls will fail clearly inside withUser if cfg is null.
      // We still attempt; if key missing, tools return error text.
      if (req.method === "POST") {
        // Allow initialize without full github setup by not throwing here —
        // actual tool invocations check currentCfg.
      }
    }
    return await handler(req);
  } finally {
    currentRequest = null;
    currentUser = null;
    currentCfg = null;
  }
}

export { wrappedHandler as GET, wrappedHandler as POST, wrappedHandler as DELETE };
