/**
 * Multi-user MCP endpoint.
 * Auth (either):
 *   - Authorization: Bearer <mcpApiKey>   (Claude Code / Cursor / Grok config)
 *   - Authorization: Bearer <oauth JWT>   (Claude web custom connector after OAuth)
 *   - X-API-Key: <mcpApiKey>
 * Handshake (initialize, tools/list, notifications) works without auth.
 * tools/call requires a valid credential.
 */

import { AsyncLocalStorage } from "node:async_hooks";
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
import { appOrigin, resolveBearerToUid } from "@/lib/oauth";
import type { GithubConfig, Origin, UserRecord } from "@/types";

interface RequestContext {
  user: UserRecord | null;
  cfg: GithubConfig | null;
  authError: string | null;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

function getRequestContext(): RequestContext {
  return requestContext.getStore() ?? { user: null, cfg: null, authError: null };
}

export const maxDuration = 30;

function extractApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key")?.trim() || null;
}

function unauthorizedResponse(message: string, req?: Request): Response {
  const origin = appOrigin(req);
  const meta = `${origin}/.well-known/oauth-protected-resource/mcp`;
  const resource = `${origin}/mcp`;
  return new Response(
    JSON.stringify({
      error: "unauthorized",
      error_description: message,
      resource,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer realm="kankali", error="invalid_token", error_description="${message.replace(/"/g, "'")}", resource_metadata="${meta}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "WWW-Authenticate",
      },
    }
  );
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
    if (!user) throw new Error("Unauthorized: user not found for OAuth token.");
    const cfg = resolveGithubConfig(user);
    if (!cfg) {
      throw new Error(
        "GitHub not connected. Open https://kankali-context.vercel.app/settings and save PAT + repo."
      );
    }
    if (user.tokenExpiresAt && Date.parse(user.tokenExpiresAt) < Date.now()) {
      throw new Error(
        "Your GitHub token has expired. Update it in Kankali Settings."
      );
    }
    return { user, cfg };
  }

  const user = await getUserByMcpKey(key);
  if (!user) {
    throw new Error(
      "Unauthorized: invalid MCP API key (rotated?). Copy the current key from https://kankali-context.vercel.app/settings"
    );
  }
  const cfg = resolveGithubConfig(user);
  if (!cfg) {
    throw new Error(
      "GitHub not connected. Open https://kankali-context.vercel.app/settings and save PAT + repo."
    );
  }
  if (user.tokenExpiresAt && Date.parse(user.tokenExpiresAt) < Date.now()) {
    throw new Error(
      "Your GitHub token has expired. Update it in Kankali Settings."
    );
  }
  return { user, cfg };
}

function isPublicMethod(method: string | undefined): boolean {
  if (!method) return true;
  if (method === "initialize" || method === "initialized") return true;
  if (method === "tools/list" || method === "prompts/list" || method === "resources/list")
    return true;
  if (method.startsWith("notifications/")) return true;
  if (method === "ping") return true;
  return false;
}

async function peekJsonRpcMethod(req: Request): Promise<string | undefined> {
  try {
    const clone = req.clone();
    const body = (await clone.json()) as { method?: string };
    return body?.method;
  } catch {
    return undefined;
  }
}

function withUser<T extends z.ZodTypeAny>(
  _schema: T,
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
      const { user, cfg, authError } = getRequestContext();
      if (!cfg || !user) {
        const detail =
          authError ||
          "Unauthorized: pass Authorization: Bearer <mcpApiKey> from Kankali Settings, or reconnect via OAuth (Claude web).";
        return {
          content: [{ type: "text" as const, text: detail }],
          isError: true,
          structuredContent: { error: detail },
        };
      }
      return await fn(cfg, args, user);
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

  const method = await peekJsonRpcMethod(req);
  const publicMethod = isPublicMethod(method);

  let user: UserRecord | null = null;
  let cfg: GithubConfig | null = null;
  let authError: string | null = null;

  try {
    const resolved = await resolveCaller(req);
    user = resolved.user;
    cfg = resolved.cfg;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    authError = msg;

    if (msg === "UNAUTHORIZED" && !publicMethod) {
      return unauthorizedResponse(
        "Authentication required. Use OAuth (Claude web) or Authorization: Bearer <mcpApiKey> from Kankali Settings.",
        req
      );
    }
  }

  return requestContext.run({ user, cfg, authError }, async () => {
    const res = await handler(req);
    const headers = new Headers(res.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(res.body, { status: res.status, headers });
  });
}

export { wrappedHandler as GET, wrappedHandler as POST, wrappedHandler as DELETE };
