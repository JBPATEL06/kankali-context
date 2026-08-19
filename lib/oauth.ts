/**
 * Minimal OAuth 2.1 + PKCE + DCR for MCP remote connectors.
 * Same-origin Authorization Server + Resource Server.
 * Access tokens are HS256 JWTs; auth codes + refresh tokens live in Firestore.
 * One URL works for Claude, ChatGPT, Grok — paste link → Connect → login.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { db } from "./firebase";

const CLIENTS = "oauth_clients";
const CODES = "oauth_codes";
const REFRESH = "oauth_refresh";

export const MCP_SCOPES = ["mcp:tools"] as const;

export function appOrigin(req?: Request): string {
  if (req) {
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (host) {
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  }
  return (
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://kankali-context.vercel.app"
  ).replace(/\/$/, "");
}

export function mcpResource(req?: Request): string {
  return `${appOrigin(req)}/mcp/git`;
}

/** Primary git MCP endpoint (NOTICE-first FS tools). */
export function mcpGitResource(req?: Request): string {
  return `${appOrigin(req)}/mcp/git`;
}

/**
 * Trusted AI host redirect URIs for MCP connector OAuth (Dynamic Client Registration & Authorization).
 *
 * ALLOWED PROVIDER CALLBACKS:
 * - Localhost / CLI (Claude Code, Cursor, Codex, Grok CLI):
 *     http://localhost:* / http://127.0.0.1:* / http://[::1]:*
 * - Claude:
 *     https://claude.ai/api/mcp/auth_callback
 *     https://claude.ai/oauth/callback
 *     https://claude.com/api/mcp/auth_callback
 *     https://claude.com/oauth/callback
 * - ChatGPT / OpenAI:
 *     https://chatgpt.com/api/aip/oauth/callback
 *     https://chatgpt.com/api/aip/apps-manage/oauth/callback
 *     https://chat.openai.com/api/aip/oauth/callback
 *     https://chat.openai.com/api/aip/apps-manage/oauth/callback
 *     https://platform.openai.com/oauth/callback
 * - Grok / xAI:
 *     https://grok.com/oauth/callback
 *     https://grok.com/api/mcp/auth_callback
 *     https://x.ai/oauth/callback
 *     https://x.ai/api/mcp/auth_callback
 */
const EXACT_ALLOWED_REDIRECT_URIS = new Set([
  // Claude
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.ai/oauth/callback",
  "https://claude.com/api/mcp/auth_callback",
  "https://claude.com/oauth/callback",

  // ChatGPT / OpenAI
  "https://chatgpt.com/api/aip/oauth/callback",
  "https://chatgpt.com/api/aip/apps-manage/oauth/callback",
  "https://chat.openai.com/api/aip/oauth/callback",
  "https://chat.openai.com/api/aip/apps-manage/oauth/callback",
  "https://platform.openai.com/oauth/callback",

  // Grok / xAI
  "https://grok.com/oauth/callback",
  "https://grok.com/api/mcp/auth_callback",
  "https://x.ai/oauth/callback",
  "https://x.ai/api/mcp/auth_callback",
]);

const STRICT_PROVIDER_PATTERNS: RegExp[] = [
  /^https:\/\/(?:www\.)?claude\.(?:ai|com)\/(?:api\/mcp\/auth_callback|oauth\/callback)\/?$/,
  /^https:\/\/(?:chatgpt\.com|chat\.openai\.com|platform\.openai\.com)\/(?:api\/aip\/)?(?:oauth\/callback|apps-manage\/oauth\/callback|connector\/callback)\/?$/,
  /^https:\/\/(?:grok\.com|x\.ai)\/(?:api\/mcp\/auth_callback|oauth\/callback)\/?$/,
];

export function isAllowedRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }

  const hostname = u.hostname.toLowerCase();

  // Local clients (Claude Code, Cursor, Codex, Grok CLI)
  if (
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") &&
    (u.protocol === "http:" || u.protocol === "https:")
  ) {
    return true;
  }

  if (u.protocol !== "https:") {
    return false;
  }

  const normalized = `https://${hostname}${u.pathname.replace(/\/+$/, "")}`;

  if (EXACT_ALLOWED_REDIRECT_URIS.has(normalized)) {
    return true;
  }

  return STRICT_PROVIDER_PATTERNS.some((pattern) => pattern.test(uri) || pattern.test(normalized));
}

function jwtSecret(): Buffer {
  const raw = process.env.JWT_SIGNING_SECRET;
  if (!raw) {
    throw new Error(
      "JWT_SIGNING_SECRET is not configured. A dedicated secret is required to sign OAuth access tokens."
    );
  }
  return createHash("sha256").update(raw).digest();
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function randomToken(bytes = 32): string {
  return b64url(randomBytes(bytes));
}

/** HS256 JWT */
export function signJwt(
  payload: Record<string, unknown>,
  expiresInSec: number
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = createHmac("sha256", jwtSecret())
    .update(`${h}.${p}`)
    .digest();
  return `${h}.${p}.${b64url(sig)}`;
}

export function verifyJwt(
  token: string
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed" };
  const [h, p, s] = parts as [string, string, string];
  let secret: Buffer;
  try {
    secret = jwtSecret();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "missing_jwt_secret" };
  }
  const expected = createHmac("sha256", secret)
    .update(`${h}.${p}`)
    .digest();
  let actual: Buffer;
  try {
    actual = fromB64url(s);
  } catch {
    return { ok: false, error: "bad signature encoding" };
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, error: "bad signature" };
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(fromB64url(p).toString("utf8"));
  } catch {
    return { ok: false, error: "bad payload" };
  }
  const exp = Number(payload.exp);
  if (!exp || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "expired" };
  }
  return { ok: true, payload };
}

export function verifyPkce(verifier: string, challenge: string, method?: string): boolean {
  const m = (method || "S256").toUpperCase();
  if (m === "PLAIN") return verifier === challenge;
  const hash = createHash("sha256").update(verifier, "utf8").digest();
  return b64url(hash) === challenge;
}

export interface OAuthClient {
  client_id: string;
  client_secret?: string | null;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  createdAt: string;
}

export async function registerClient(input: {
  client_name?: string;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}): Promise<OAuthClient & { client_id_issued_at: number }> {
  const rawUris = input.redirect_uris?.length
    ? input.redirect_uris
    : ["https://claude.ai/api/mcp/auth_callback"];

  for (const uri of rawUris) {
    if (!isAllowedRedirectUri(uri)) {
      throw new Error(`Invalid redirect_uri: ${uri}. Not in allowed provider callback list.`);
    }
  }

  const client: OAuthClient = {
    client_id: `kc_${randomBytes(16).toString("hex")}`,
    client_secret: null,
    client_name: input.client_name || "MCP Client",
    redirect_uris: rawUris,
    grant_types: input.grant_types || ["authorization_code", "refresh_token"],
    response_types: input.response_types || ["code"],
    token_endpoint_auth_method:
      input.token_endpoint_auth_method || "none",
    createdAt: new Date().toISOString(),
  };
  await db().collection(CLIENTS).doc(client.client_id).set(client);
  return {
    ...client,
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const snap = await db().collection(CLIENTS).doc(clientId).get();
  if (!snap.exists) return null;
  return snap.data() as OAuthClient;
}

export async function storeAuthCode(params: {
  code: string;
  uid: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource?: string;
  scope?: string;
  ttlSec?: number;
}): Promise<void> {
  const ttl = params.ttlSec ?? 600;
  await db()
    .collection(CODES)
    .doc(params.code)
    .set({
      uid: params.uid,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      resource: params.resource || mcpResource(),
      scope: params.scope || MCP_SCOPES.join(" "),
      expiresAt: Date.now() + ttl * 1000,
      used: false,
    });
}

export async function consumeAuthCode(code: string): Promise<{
  uid: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string;
  scope: string;
} | null> {
  const ref = db().collection(CODES).doc(code);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.used) return null;
  if (Date.now() > Number(data.expiresAt)) return null;
  await ref.update({ used: true });
  return {
    uid: data.uid,
    clientId: data.clientId,
    redirectUri: data.redirectUri,
    codeChallenge: data.codeChallenge,
    codeChallengeMethod: data.codeChallengeMethod,
    resource: data.resource,
    scope: data.scope,
  };
}

export function issueAccessToken(uid: string, resource: string, scope: string): {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
} {
  const expires_in = 3600;
  const access_token = signJwt(
    {
      sub: uid,
      aud: resource,
      scope,
      typ: "access",
    },
    expires_in
  );
  return {
    access_token,
    expires_in,
    token_type: "Bearer",
    scope,
  };
}

export async function issueRefreshToken(
  uid: string,
  clientId: string,
  resource: string,
  scope: string
): Promise<string> {
  const token = `kr_${randomBytes(32).toString("hex")}`;
  await db()
    .collection(REFRESH)
    .doc(token)
    .set({
      uid,
      clientId,
      resource,
      scope,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
  return token;
}

export async function rotateRefreshToken(oldToken: string): Promise<{
  uid: string;
  clientId: string;
  resource: string;
  scope: string;
} | null> {
  const ref = db().collection(REFRESH).doc(oldToken);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (Date.now() > Number(data.expiresAt)) {
    await ref.delete();
    return null;
  }
  await ref.delete();
  return {
    uid: data.uid,
    clientId: data.clientId,
    resource: data.resource,
    scope: data.scope,
  };
}

/** Resolve Bearer token → uid. Accepts OAuth JWT. */
export async function resolveBearerToUid(
  token: string
): Promise<{ uid: string; via: "oauth" | "api_key" } | null> {
  if (token.split(".").length === 3) {
    const v = verifyJwt(token);
    if (!v.ok) return null;
    if (v.payload.typ !== "access") return null;
    const sub = String(v.payload.sub || "");
    if (!sub) return null;
    return { uid: sub, via: "oauth" };
  }
  return null;
}

export function protectedResourceMetadata(resourceUrl?: string, req?: Request) {
  const origin = appOrigin(req);
  return {
    resource: resourceUrl || mcpGitResource(req),
    authorization_servers: [origin],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: origin,
  };
}

export function authorizationServerMetadata(req?: Request) {
  const origin = appOrigin(req);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: [...MCP_SCOPES],
    service_documentation: origin,
  };
}

/** Clean up expired OAuth codes and refresh tokens */
export async function cleanExpiredOAuthTokens(): Promise<{
  codesDeleted: number;
  refreshDeleted: number;
}> {
  const now = Date.now();
  let codesDeleted = 0;
  let refreshDeleted = 0;

  try {
    const expiredCodesSnap = await db()
      .collection(CODES)
      .where("expiresAt", "<", now)
      .limit(100)
      .get();

    if (!expiredCodesSnap.empty) {
      const batch = db().batch();
      for (const doc of expiredCodesSnap.docs) {
        batch.delete(doc.ref);
        codesDeleted++;
      }
      await batch.commit();
    }
  } catch {}

  try {
    const expiredRefreshSnap = await db()
      .collection(REFRESH)
      .where("expiresAt", "<", now)
      .limit(100)
      .get();

    if (!expiredRefreshSnap.empty) {
      const batch = db().batch();
      for (const doc of expiredRefreshSnap.docs) {
        batch.delete(doc.ref);
        refreshDeleted++;
      }
      await batch.commit();
    }
  } catch {}

  return { codesDeleted, refreshDeleted };
}

