/**
 * Multi-user MCP endpoint.
 * Auth (either):
 *   - Authorization: Bearer <mcpApiKey>   (Claude Code / Cursor / Grok config)
 *   - Authorization: Bearer <oauth JWT>   (Claude web custom connector after OAuth)
 *   - X-API-Key: <mcpApiKey>
 * GitHub ops use that user's encrypted PAT.
 */

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getUser, getUserByMcpKey, resolveGithubConfig } from "@/lib/users";
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
import {
  appOrigin,
  resolveBearerToUid,
} from "@/lib/oauth";
import type { GithubConfig, Origin, UserRecord } from "@/types";

export const maxDuration = 30;

let currentUser: UserRecord | null = null;
let currentCfg: GithubConfig | null = null;

function extractApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key")?.trim() || null;
}

function unauthorizedResponse(message: string): Response {
  const origin = appOrigin();
  const meta = `${origin}/.well-known/oauth-protected-resource`;
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer realm="kankali", resource_metadata="${meta}"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function resolveCaller(req: Request): Promise<{
  user: UserRecord;
  cfg: GithubConfig;
}> {
  const key = extractApiKey(req);
  if (!key) {
    throw new Error("UNAUTHORIZED");
  }

  const oauth = await resolveBearerToUid(key);
  if (oauth) {
    const user = await getUser(oauth.uid);
    if (!user) throw new Error("Unauthorized: user not found for token.");
    const cfg = resolveGithubConfig(user);
    if (!cfg) {
      throw new Error(
        "GitHub not connected. Sign in at the Kankali dashboard and save your GitHub token + repo under Settings."
      );
    }
    if (user.tokenExpiresAt && Date.parse(user.tokenExpiresAt) < Date.now()) {
      throw new Error(
        "Your GitHub token has expired. Update it in the Kankali Settings page."
      );
    }
    return { user, cfg };
  }

  const user = await getUserByMcpKey(key);
  if (!user) {
    throw new Error("Unauthorized: invalid MCP API key or access token.");
  }
  const cfg = resolveGithubConfig(user);
  if (!cfg) {
    throw new Error(
      "GitHub not connected. Sign in at the Kankali dashboard and save your GitHub token + repo under Settings."
    );
  }
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
          content: [
            {
              type: "text" as const,
              text: "Unauthorized: connect via OAuth or pass your MCP API key.",
            },
          ],
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
  currentUser = null;
  currentCfg = null;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-API-Key, Accept, Mcp-Session-Id",
        "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
      },
    });
  }

  try {
    try {
      const resolved = await resolveCaller(req);
      currentUser = resolved.user;
      currentCfg = resolved.cfg;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "UNAUTHORIZED") {
        return unauthorizedResponse(
          "Authentication required. Use OAuth (Claude web) or Authorization: Bearer <mcpApiKey>."
        );
      }
    }
    const res = await handler(req);
    const headers = new Headers(res.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(res.body, { status: res.status, headers });
  } finally {
    currentUser = null;
    currentCfg = null;
  }
}

export { wrappedHandler as GET, wrappedHandler as POST, wrappedHandler as DELETE };
