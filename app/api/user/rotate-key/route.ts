import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { rotateMcpKey } from "@/lib/users";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { uid?: string } | undefined)?.uid;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = await rotateMcpKey(uid);
  return NextResponse.json({ mcpApiKey: key });
}
