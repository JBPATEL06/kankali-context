/**
 * Kankali git MCP — free-form file/folder CRUD on the user's GitHub repo.
 * Endpoint: https://kankali-context.vercel.app/mcp/git
 *
 * Auth: Bearer <mcpApiKey> | OAuth JWT | X-API-Key
 * Agents MUST call read_notice before other tools.
 *
 * Missing/invalid connector auth → HTTP 401 + WWW-Authenticate (resource_metadata)
 * so Grok/Claude/ChatGPT show reconnect / OAuth instead of a silent tool error.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getUser, getUserByMcpKey, resolveGithubConfig } from "@/lib/users";
import { appOrigin, resolveBearerToUid } from "@/lib/oauth";
import { verifyMasterToken } from "@/lib/master-token";
import type { GithubConfig, UserRecord } from "@/types";
import {
  readNoticeSchema,
  toolReadNotice,
  readIndexSchema,
  toolReadIndex,
  readOutlineSchema,
  toolReadOutline,
  listTreeSchema,
  toolListTree,
  readFileSchema,
  toolReadFile,
  writeFileSchema,
  toolWriteFile,
  deletePathSchema,
  toolDeletePath,
  searchFilesSchema,
  toolSearchFiles,
} from "@/lib/tools-git";
import {
  projectUpsertSchema,
  toolProjectUpsert,
  projectCodebaseNoteSchema,
  toolProjectCodebaseNote,
  projectGetSchema,
  toolProjectGet,
  projectListSchema,
  toolProjectList,
} from "@/lib/tools-project";
import {
  currentSessionSetSchema,
  toolCurrentSessionSet,
  currentSessionGetSchema,
  toolCurrentSessionGet,
} from "@/lib/tools-session";

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
  const keyHeader = req.headers.get("x-api-key")?.trim();
  if (keyHeader) return keyHeader;

  const url = new URL(req.url);
  return url.searchParams.get("token") || url.searchParams.get("key") || null;
}

function unauthorizedResponse(message: string, req?: Request): Response {
  const origin = appOrigin(req);
  const meta = `${origin}/.well-known/oauth-protected-resource/mcp/git`;
  const resource = `${origin}/mcp/git`;
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

/** Auth errors that must become HTTP 401 + WWW-Authenticate (force client reauth). */
class AuthRequiredError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

async function resolveCaller(req: Request): Promise<{
  user: UserRecord;
  cfg: GithubConfig;
}> {
  const key = extractApiKey(req);
  if (!key)
    throw new AuthRequiredError(
      "Authentication required. Connect via OAuth, Master URL token, or pass Bearer MCP API key."
    );

  let user: UserRecord | null = null;

  if (key.startsWith("km_")) {
    const verified = verifyMasterToken(key);
    if (!verified.valid || !verified.uid) {
      throw new AuthRequiredError(verified.error || "Invalid or expired Master token.");
    }
    user = await getUser(verified.uid);
  } else {
    const oauth = await resolveBearerToUid(key);
    if (oauth) {
      user = await getUser(oauth.uid);
      if (!user) {
        throw new AuthRequiredError("OAuth token valid but user not found. Sign in again.");
      }
    } else if (key.split(".").length === 3) {
      throw new AuthRequiredError(
        "OAuth access token invalid or expired. Reconnect the connector."
      );
    } else {
      user = await getUserByMcpKey(key);
    }
  }

  if (!user) {
    throw new AuthRequiredError(
      "Invalid or rotated MCP API key. Reconnect OAuth or copy the current key from Settings."
    );
  }

  const cfg = resolveGithubConfig(user);
  if (!cfg) {
    throw new Error(
      "GitHub not connected. Open https://kankali-context.vercel.app/settings and save PAT + repo."
    );
  }
  if (user.tokenExpiresAt && Date.parse(user.tokenExpiresAt) < Date.now()) {
    throw new Error("Your GitHub token has expired. Update it in Kankali Settings.");
  }
  return { user, cfg };
}

/** Strict: tools/list + initialize require auth → Connect shows login. */
function isPublicMethod(method: string | undefined): boolean {
  if (!method) return false;
  if (method.startsWith("notifications/")) return true;
  if (method === "ping") return true;
  return false;
}

async function peekJsonRpcMethod(req: Request): Promise<string | undefined> {
  try {
    const body = (await req.clone().json()) as { method?: string };
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
          "Unauthorized: OAuth or Authorization: Bearer <mcpApiKey> required.";
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

const MUST =
  "REQUIRED: call read_notice before other tools. Prefer short .md files. Update index.md when structure changes.";

const handler = createMcpHandler((server) => {
  server.registerTool(
    "read_notice",
    {
      description:
        "Read NOTICE.md (how to use this git context repo). MUST be called first every session. Bootstraps NOTICE.md + index.md if missing.",
      inputSchema: readNoticeSchema.shape,
    },
    withUser(readNoticeSchema, async (cfg) => toolReadNotice(cfg))
  );

  server.registerTool(
    "read_index",
    {
      description: `${MUST} Read index.md — catalog of paths and purposes.`,
      inputSchema: readIndexSchema.shape,
    },
    withUser(readIndexSchema, async (cfg) => toolReadIndex(cfg))
  );

  server.registerTool(
    "read_outline",
    {
      description:
        "Inspect Table of Contents & Anchors of a document (e.g. ## [anchor] Title) with line numbers and sizes to save tokens.",
      inputSchema: readOutlineSchema.shape,
    },
    withUser(readOutlineSchema, async (cfg, args) => toolReadOutline(cfg, args))
  );

  server.registerTool(
    "list_tree",
    {
      description: `${MUST} List files/folders at a path (optional recursive).`,
      inputSchema: listTreeSchema.shape,
    },
    withUser(listTreeSchema, async (cfg, args) => toolListTree(cfg, args))
  );

  server.registerTool(
    "read_file",
    {
      description: `${MUST} Read any file by path relative to repo root.`,
      inputSchema: readFileSchema.shape,
    },
    withUser(readFileSchema, async (cfg, args) => toolReadFile(cfg, args))
  );

  server.registerTool(
    "write_file",
    {
      description: `${MUST} Create or update a file. Prefer .md. AI chooses structure.`,
      inputSchema: writeFileSchema.shape,
    },
    withUser(writeFileSchema, async (cfg, args) => toolWriteFile(cfg, args))
  );

  server.registerTool(
    "delete_path",
    {
      description: `${MUST} Delete a file or folder (recursive for folders). Requires two-step confirmation token. Cannot delete NOTICE.md.`,
      inputSchema: deletePathSchema.shape,
    },
    withUser(deletePathSchema, async (cfg, args, user) => toolDeletePath(cfg, args, user.uid))
  );

  server.registerTool(
    "search_files",
    {
      description: `${MUST} Keyword search across files in the repo.`,
      inputSchema: searchFilesSchema.shape,
    },
    withUser(searchFilesSchema, async (cfg, args) => toolSearchFiles(cfg, args))
  );

  server.registerTool(
    "project_upsert",
    {
      description: `${MUST} Create/update project/<slug> status.md + docs/overview.md. Auto-creates folders.`,
      inputSchema: projectUpsertSchema.shape,
    },
    withUser(projectUpsertSchema, async (cfg, args) => toolProjectUpsert(cfg, args))
  );

  server.registerTool(
    "project_codebase_note",
    {
      description: `${MUST} Write technical note under project/<slug>/codebase/ (not docs prose).`,
      inputSchema: projectCodebaseNoteSchema.shape,
    },
    withUser(projectCodebaseNoteSchema, async (cfg, args) => toolProjectCodebaseNote(cfg, args))
  );

  server.registerTool(
    "project_get",
    {
      description: `${MUST} Read full project folder (status + docs + codebase listing).`,
      inputSchema: projectGetSchema.shape,
    },
    withUser(projectGetSchema, async (cfg, args) => toolProjectGet(cfg, args))
  );

  server.registerTool(
    "project_list",
    {
      description: `${MUST} List all project slugs with one-line status.`,
      inputSchema: projectListSchema.shape,
    },
    withUser(projectListSchema, async (cfg) => toolProjectList(cfg))
  );

  server.registerTool(
    "current_session_set",
    {
      description: `${MUST} Overwrite session/current.md (live curated state only). Token pressure or explicit store.`,
      inputSchema: currentSessionSetSchema.shape,
    },
    withUser(currentSessionSetSchema, async (cfg, args) => toolCurrentSessionSet(cfg, args))
  );

  server.registerTool(
    "current_session_get",
    {
      description: `${MUST} Read session/current.md. Call after read_notice on session start.`,
      inputSchema: currentSessionGetSchema.shape,
    },
    withUser(currentSessionGetSchema, async (cfg) => toolCurrentSessionGet(cfg))
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

    // Missing/invalid/expired connector auth → always 401 on non-public methods
    // so Grok/Claude/ChatGPT show reconnect / OAuth (not a silent tool error).
    const isAuth =
      err instanceof AuthRequiredError ||
      msg === "UNAUTHORIZED" ||
      /authentication required|oauth access token|invalid or rotated mcp|api key|unauthorized/i.test(
        msg
      );

    if (!publicMethod && isAuth) {
      return unauthorizedResponse(msg, req);
    }
    // Config errors (GitHub not connected, PAT expired) fall through to tool isError
  }

  // tools/call without resolved user must not soft-fail — force reauth
  if (!publicMethod && !user) {
    return unauthorizedResponse(
      authError ||
        "Authentication required. Reconnect Kankali connector (OAuth) or pass Bearer MCP API key.",
      req
    );
  }

  return requestContext.run({ user, cfg, authError }, async () => {
    const res = await handler(req);
    const headers = new Headers(res.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id");
    return new Response(res.body, { status: res.status, headers });
  });
}

export { wrappedHandler as GET, wrappedHandler as POST, wrappedHandler as DELETE };
