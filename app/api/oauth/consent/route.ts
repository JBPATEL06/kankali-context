import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import {
  getClient,
  storeAuthCode,
  randomToken,
  mcpResource,
  MCP_SCOPES,
} from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { uid?: string } | undefined)?.uid;
  if (!session?.user?.email || !uid) {
    return Response.json(
      { error: "login_required", error_description: "Sign in first" },
      { status: 401 }
    );
  }

  let body: Record<string, string> = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const clientId = body.client_id;
  const redirectUri = body.redirect_uri;
  const state = body.state || "";
  const codeChallenge = body.code_challenge;
  const codeChallengeMethod = body.code_challenge_method || "S256";
  const resource = body.resource || mcpResource();
  const scope = body.scope || MCP_SCOPES.join(" ");

  if (!clientId || !redirectUri || !codeChallenge) {
    return Response.json(
      {
        error: "invalid_request",
        error_description: "client_id, redirect_uri, code_challenge required",
      },
      { status: 400 }
    );
  }

  const client = await getClient(clientId);
  if (!client) {
    return Response.json(
      { error: "invalid_client", error_description: "Unknown client_id" },
      { status: 400 }
    );
  }

  if (!client.redirect_uris.includes(redirectUri)) {
    const allowedExtra = [
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
    ];
    if (!allowedExtra.includes(redirectUri)) {
      return Response.json(
        { error: "invalid_request", error_description: "redirect_uri not registered" },
        { status: 400 }
      );
    }
  }

  const code = randomToken(24);
  await storeAuthCode({
    code,
    uid: String(uid),
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    resource,
    scope,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);

  return Response.json({ redirect: url.toString() });
}
