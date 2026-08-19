import {
  consumeAuthCode,
  getClient,
  issueAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  verifyPkce,
  mcpResource,
  isAllowedRedirectUri,
} from "@/lib/oauth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function formOrJson(req: Request): Promise<Record<string, string>> {
  return req
    .clone()
    .text()
    .then(async (text) => {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try {
          const j = JSON.parse(text) as Record<string, unknown>;
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(j)) {
            if (v != null) out[k] = String(v);
          }
          return out;
        } catch {
          return {};
        }
      }
      const params = new URLSearchParams(text);
      const out: Record<string, string> = {};
      params.forEach((v, k) => {
        out[k] = v;
      });
      return out;
    });
}

function jsonError(error: string, status = 400, desc?: string) {
  return Response.json(
    { error, error_description: desc || error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}

function matchesRedirectUri(registeredUris: string[], targetUri: string): boolean {
  const normTarget = targetUri.replace(/\/+$/, "");
  return registeredUris.some((u) => u === targetUri || u.replace(/\/+$/, "") === normTarget);
}

export async function POST(req: Request) {
  try {
    const limit = await checkRateLimit(req, "oauth:token", { windowMs: 60_000, maxRequests: 120 });
    if (!limit.allowed) {
      return rateLimitResponse(limit.retryAfterSeconds);
    }

    const body = await formOrJson(req);
    const grant = body.grant_type;

    if (grant === "authorization_code") {
      const code = body.code;
      const redirectUri = body.redirect_uri;
      const clientId = body.client_id;
      const verifier = body.code_verifier;

      if (!code || !redirectUri || !clientId || !verifier) {
        return jsonError(
          "invalid_request",
          400,
          "code, redirect_uri, client_id, code_verifier required"
        );
      }

      const client = await getClient(clientId);
      if (!client) return jsonError("invalid_client", 401);

      if (
        !matchesRedirectUri(client.redirect_uris, redirectUri) ||
        !isAllowedRedirectUri(redirectUri)
      ) {
        return jsonError("invalid_grant", 400, "redirect_uri mismatch or not allowed");
      }

      const stored = await consumeAuthCode(code);
      if (!stored) return jsonError("invalid_grant", 400, "code invalid or used");

      const normStoredUri = stored.redirectUri.replace(/\/+$/, "");
      const normReqUri = redirectUri.replace(/\/+$/, "");

      if (stored.clientId !== clientId || normStoredUri !== normReqUri) {
        return jsonError("invalid_grant", 400, "code binding mismatch");
      }

      if (
        !verifyPkce(verifier, stored.codeChallenge, stored.codeChallengeMethod)
      ) {
        return jsonError("invalid_grant", 400, "pkce verification failed");
      }

      const resource = stored.resource || mcpResource(req);
      const access = issueAccessToken(stored.uid, resource, stored.scope);
      const refresh_token = await issueRefreshToken(
        stored.uid,
        clientId,
        resource,
        stored.scope
      );

      return Response.json(
        {
          ...access,
          refresh_token,
        },
        {
          headers: {
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    if (grant === "refresh_token") {
      const rt = body.refresh_token;
      const clientId = body.client_id;
      if (!rt || !clientId) {
        return jsonError("invalid_request", 400, "refresh_token and client_id required");
      }
      const client = await getClient(clientId);
      if (!client) return jsonError("invalid_client", 401);

      const prev = await rotateRefreshToken(rt);
      if (!prev || prev.clientId !== clientId) {
        return jsonError("invalid_grant", 400, "refresh_token invalid");
      }

      const access = issueAccessToken(prev.uid, prev.resource, prev.scope);
      const refresh_token = await issueRefreshToken(
        prev.uid,
        clientId,
        prev.resource,
        prev.scope
      );

      return Response.json(
        { ...access, refresh_token },
        {
          headers: {
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return jsonError("unsupported_grant_type", 400);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal token exchange error";
    return jsonError("server_error", 500, msg);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
