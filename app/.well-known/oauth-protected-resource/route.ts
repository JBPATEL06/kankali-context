import { protectedResourceMetadata } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(protectedResourceMetadata(), {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
