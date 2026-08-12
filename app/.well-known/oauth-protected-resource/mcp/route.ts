import { protectedResourceMetadata } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** Path-appended PRM: /.well-known/oauth-protected-resource/mcp */
export async function GET() {
  return Response.json(protectedResourceMetadata(), {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
