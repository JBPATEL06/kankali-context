import { registerClient } from "@/lib/oauth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limit = await checkRateLimit(req, "oauth:register", { windowMs: 60_000, maxRequests: 10 });
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterSeconds);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const client = await registerClient({
      client_name: typeof body.client_name === "string" ? body.client_name : undefined,
      redirect_uris: Array.isArray(body.redirect_uris)
        ? (body.redirect_uris as string[])
        : undefined,
      grant_types: Array.isArray(body.grant_types)
        ? (body.grant_types as string[])
        : undefined,
      response_types: Array.isArray(body.response_types)
        ? (body.response_types as string[])
        : undefined,
      token_endpoint_auth_method:
        typeof body.token_endpoint_auth_method === "string"
          ? body.token_endpoint_auth_method
          : undefined,
    });

    const { client_secret, ...rest } = client;
    return Response.json(
      {
        ...rest,
        client_id: client.client_id,
        client_id_issued_at: client.client_id_issued_at,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Registration failed";
    return Response.json(
      {
        error: "invalid_redirect_uri",
        error_description: msg,
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
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
