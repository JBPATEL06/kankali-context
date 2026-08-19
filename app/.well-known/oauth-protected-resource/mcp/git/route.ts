import { mcpGitResource, protectedResourceMetadata } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** Path-appended PRM: /.well-known/oauth-protected-resource/mcp/git */
export async function GET(req: Request) {
  return Response.json(protectedResourceMetadata(mcpGitResource(req), req), {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
