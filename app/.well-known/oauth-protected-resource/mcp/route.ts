import { mcpResource, protectedResourceMetadata } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** Path-appended PRM: /.well-known/oauth-protected-resource/mcp */
export async function GET(req: Request) {
  return Response.json(protectedResourceMetadata(mcpResource(req), req), {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
