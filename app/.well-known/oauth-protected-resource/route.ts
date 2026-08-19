import { protectedResourceMetadata } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json(protectedResourceMetadata(undefined, req), {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
