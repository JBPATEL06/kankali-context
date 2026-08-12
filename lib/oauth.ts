/**
 * Minimal OAuth 2.1 + PKCE + DCR for MCP remote connectors (Claude web).
 * Same-origin Authorization Server + Resource Server.
 * Access tokens are HS256 JWTs; auth codes + refresh tokens live in Firestore.
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

export function appOrigin(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://kankali-context.vercel.app"
  ).replace(/\/$/, "");
}

export function mcpResource(): string {
  return `${appOrigin()}/mcp`;
}

function jwtSecret(): Buffer {
  const raw =
    process.env.ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    "dev-insecure-key-change-me";
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
  const expected = createHmac("sha256", jwtSecret())
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
  const redirect_uris = input.redirect_uris?.length
    ? input.redirect_uris
    : ["https://claude.ai/api/mcp/auth_callback"];

  const client: OAuthClient = {
    client_id: `kc_${randomBytes(16).toString("hex")}`,
    client_secret: null,
    client_name: input.client_name || "MCP Client",
    redirect_uris,
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

/** Resolve Bearer token → uid. Accepts OAuth JWT or legacy mcpApiKey. */
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

export function protectedResourceMetadata() {
  const origin = appOrigin();
  return {
    resource: mcpResource(),
    authorization_servers: [origin],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: origin,
  };
}

export function authorizationServerMetadata() {
  const origin = appOrigin();
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
