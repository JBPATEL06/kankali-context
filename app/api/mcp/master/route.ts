/**
 * Kankali Master Unified MCP Server — dual-cloud AI memory vault (Google Drive + GitHub).
 * Endpoint: https://kankali-context.vercel.app/mcp/master
 *
 * Auth: Bearer <masterToken> | Bearer <mcpApiKey> | ?token=<masterToken>
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getUser, getUserByMcpKey, resolveGithubConfig } from "@/lib/users";
import { appOrigin, resolveBearerToUid } from "@/lib/oauth";
import { decrypt } from "@/lib/crypto";
import { refreshGoogleToken } from "@/lib/drive-fs";
import { verifyMasterToken } from "@/lib/master-token";
import type { UserRecord } from "@/types";
import {
  type MasterContext,
  type ToolResult,
  masterReadNoticeSchema,
  toolMasterReadNotice,
  masterReadIndexSchema,
  toolMasterReadIndex,
  masterReadOutlineSchema,
  toolMasterReadOutline,
  masterListTreeSchema,
  toolMasterListTree,
  masterReadFileSchema,
  toolMasterReadFile,
  masterWriteFileSchema,
  toolMasterWriteFile,
  masterDeletePathSchema,
  toolMasterDeletePath,
  masterSearchFilesSchema,
  toolMasterSearchFiles,
  masterProjectUpsertSchema,
  toolMasterProjectUpsert,
  masterProjectCodebaseNoteSchema,
  toolMasterProjectCodebaseNote,
  masterProjectGetSchema,
  toolMasterProjectGet,
  masterProjectListSchema,
  toolMasterProjectList,
  masterCurrentSessionSetSchema,
  toolMasterCurrentSessionSet,
  masterCurrentSessionGetSchema,
  toolMasterCurrentSessionGet,
} from "@/lib/tools-master";

interface RequestContext {
  user: UserRecord | null;
  masterCtx: MasterContext | null;
  authError: string | null;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

function getRequestContext(): RequestContext {
  return requestContext.getStore() ?? { user: null, masterCtx: null, authError: null };
}

export const maxDuration = 30;

function extractApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const apiKeyHeader = req.headers.get("x-api-key")?.trim();
  if (apiKeyHeader) return apiKeyHeader;

  const url = new URL(req.url);
  return url.searchParams.get("token") || url.searchParams.get("key") || null;
}

function unauthorizedResponse(message: string, req?: Request): Response {
  const origin = appOrigin(req);
  const meta = `${origin}/.well-known/oauth-protected-resource/mcp/master`;
  const resource = `${origin}/mcp/master`;
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

class AuthRequiredError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

async function resolveCaller(req: Request): Promise<{
  user: UserRecord;
  masterCtx: MasterContext;
}> {
  const key = extractApiKey(req);
  if (!key) {
    throw new AuthRequiredError(
      "No Master MCP API Key or Bearer token provided. Pass Authorization: Bearer <key> or ?token=<token>."
    );
  }

  let user: UserRecord | null = null;

  // 1. Signed Master Token with Expiration
  if (key.startsWith("km_")) {
    const verified = verifyMasterToken(key);
    if (!verified.valid || !verified.uid) {
      throw new AuthRequiredError(verified.error || "Invalid or expired Master MCP token.");
    }
    user = await getUser(verified.uid);
  } else {
    // 2. Standard API key or OAuth Token
    const oauthUid = await resolveBearerToUid(key);
    if (oauthUid) {
      user = await getUser(oauthUid.uid);
    } else {
      user = await getUserByMcpKey(key);
    }
  }

  if (!user) {
    throw new AuthRequiredError("Invalid Master MCP Key: no matching user account found.");
  }

  // Check profile token expiration reminder
  if (user.tokenExpiresAt) {
    const exp = new Date(user.tokenExpiresAt).getTime();
    if (!Number.isNaN(exp) && Date.now() > exp) {
      throw new AuthRequiredError("Master MCP access has expired. Please renew token in Settings.");
    }
  }

  let driveToken: string | null = null;
  if (user.googleRefreshTokenEnc) {
    try {
      const refreshToken = decrypt(user.googleRefreshTokenEnc);
      driveToken = await refreshGoogleToken(refreshToken);
    } catch {
      // ignore
    }
  }

  const gitCfg = resolveGithubConfig(user);

  if (!driveToken && !gitCfg) {
    throw new AuthRequiredError(
      "Neither Google Drive nor GitHub Storage Vault is connected. Connect at least one vault in Settings."
    );
  }

  return {
    user,
    masterCtx: {
      gitCfg,
      driveToken,
      uid: user.uid,
    },
  };
}

function withMaster<T extends z.ZodTypeAny>(
  _schema: T,
  fn: (
    ctx: MasterContext,
    args: z.infer<T>,
    user: UserRecord
  ) => Promise<ToolResult>
) {
  return async (args: z.infer<T>) => {
    try {
      const { user, masterCtx, authError } = getRequestContext();
      if (!masterCtx || !user) {
        const detail =
          authError ||
          "Unauthorized: Master MCP key or Bearer token required.";
        return {
          content: [{ type: "text" as const, text: detail }],
          isError: true,
          structuredContent: { error: detail },
        };
      }
      return await fn(masterCtx, args, user);
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
  // 1. read_notice
  server.registerTool(
    "read_notice",
    {
      description:
        "MANDATORY first call in every session. Returns protocol rules for Kankali Master Unified Vault.",
      inputSchema: masterReadNoticeSchema.shape,
    },
    withMaster(masterReadNoticeSchema, async () => toolMasterReadNotice())
  );

  // 2. read_index
  server.registerTool(
    "read_index",
    {
      description: "Read index catalog mapping file paths to their purpose across vaults.",
      inputSchema: masterReadIndexSchema.shape,
    },
    withMaster(masterReadIndexSchema, async (ctx, args) => toolMasterReadIndex(ctx, args))
  );

  // 3. read_outline (TOC & Anchors)
  server.registerTool(
    "read_outline",
    {
      description:
        "Inspect Table of Contents & Anchors of a document (e.g. ## [anchor] Title) with line numbers and sizes to save tokens.",
      inputSchema: masterReadOutlineSchema.shape,
    },
    withMaster(masterReadOutlineSchema, async (ctx, args) => toolMasterReadOutline(ctx, args))
  );

  // 4. list_tree
  server.registerTool(
    "list_tree",
    {
      description:
        "List files and directories across vaults. Set target='drive' | 'git' | 'both'.",
      inputSchema: masterListTreeSchema.shape,
    },
    withMaster(masterListTreeSchema, async (ctx, args) => toolMasterListTree(ctx, args))
  );

  // 4. read_file
  server.registerTool(
    "read_file",
    {
      description:
        "Read file content from Google Drive or GitHub. Set target='drive' | 'git' or leave blank for auto-detect.",
      inputSchema: masterReadFileSchema.shape,
    },
    withMaster(masterReadFileSchema, async (ctx, args) => toolMasterReadFile(ctx, args))
  );

  // 5. write_file
  server.registerTool(
    "write_file",
    {
      description:
        "Write file to storage. Specify target='drive' | 'git' | 'both' (default 'both').",
      inputSchema: masterWriteFileSchema.shape,
    },
    withMaster(masterWriteFileSchema, async (ctx, args) => toolMasterWriteFile(ctx, args))
  );

  // 6. delete_path
  server.registerTool(
    "delete_path",
    {
      description:
        "Delete file or folder. Requires two-step HMAC confirmation token. Set target='drive' | 'git' | 'both'.",
      inputSchema: masterDeletePathSchema.shape,
    },
    withMaster(masterDeletePathSchema, async (ctx, args) => toolMasterDeletePath(ctx, args))
  );

  // 7. search_files
  server.registerTool(
    "search_files",
    {
      description: "Search for files by query across Drive, GitHub, or both.",
      inputSchema: masterSearchFilesSchema.shape,
    },
    withMaster(masterSearchFilesSchema, async (ctx, args) => toolMasterSearchFiles(ctx, args))
  );

  // 8. project_upsert
  server.registerTool(
    "project_upsert",
    {
      description:
        "Scaffold complete SDLC structure for a project. Set target='drive' | 'git' | 'both'.",
      inputSchema: masterProjectUpsertSchema.shape,
    },
    withMaster(masterProjectUpsertSchema, async (ctx, args) => toolMasterProjectUpsert(ctx, args))
  );

  // 9. project_codebase_note
  server.registerTool(
    "project_codebase_note",
    {
      description:
        "Append or create an architecture note under project/<slug>/codebase/<note_name>.md.",
      inputSchema: masterProjectCodebaseNoteSchema.shape,
    },
    withMaster(masterProjectCodebaseNoteSchema, async (ctx, args) =>
      toolMasterProjectCodebaseNote(ctx, args)
    )
  );

  // 10. project_get
  server.registerTool(
    "project_get",
    {
      description:
        "Retrieve project SDLC documentation with optional section scoping ('status'|'docs'|'codebase'|'resources'|'all').",
      inputSchema: masterProjectGetSchema.shape,
    },
    withMaster(masterProjectGetSchema, async (ctx, args) => toolMasterProjectGet(ctx, args))
  );

  // 11. project_list
  server.registerTool(
    "project_list",
    {
      description: "List all projects across connected cloud vaults.",
      inputSchema: masterProjectListSchema.shape,
    },
    withMaster(masterProjectListSchema, async (ctx, args) => toolMasterProjectList(ctx, args))
  );

  // 12. current_session_set
  server.registerTool(
    "current_session_set",
    {
      description: "Save active conversation snapshot. Set target='drive' | 'git' | 'both'.",
      inputSchema: masterCurrentSessionSetSchema.shape,
    },
    withMaster(masterCurrentSessionSetSchema, async (ctx, args) =>
      toolMasterCurrentSessionSet(ctx, args)
    )
  );

  // 13. current_session_get
  server.registerTool(
    "current_session_get",
    {
      description: "Read active conversation snapshot from vault.",
      inputSchema: masterCurrentSessionGetSchema.shape,
    },
    withMaster(masterCurrentSessionGetSchema, async (ctx, args) =>
      toolMasterCurrentSessionGet(ctx, args)
    )
  );
});

async function routeWithAuth(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      },
    });
  }

  let caller: { user: UserRecord; masterCtx: MasterContext } | null = null;
  let authError: string | null = null;

  try {
    caller = await resolveCaller(req);
  } catch (err: unknown) {
    if (err instanceof AuthRequiredError) {
      return unauthorizedResponse(err.message, req);
    }
    const msg = err instanceof Error ? err.message : String(err);
    authError = `Auth error: ${msg}`;
  }

  return requestContext.run(
    {
      user: caller?.user ?? null,
      masterCtx: caller?.masterCtx ?? null,
      authError,
    },
    async () => {
      const res = await handler(req);
      const headers = new Headers(res.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    }
  );
}

export const GET = routeWithAuth;
export const POST = routeWithAuth;
export const DELETE = routeWithAuth;
export const OPTIONS = routeWithAuth;
