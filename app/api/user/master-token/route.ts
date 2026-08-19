import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { createMasterToken } from "@/lib/master-token";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { uid?: string } | undefined)?.uid;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let days = 60; // Max default 60 days

    if (body.expiresAtDate) {
      const targetTime = new Date(body.expiresAtDate).getTime();
      if (!Number.isNaN(targetTime) && targetTime > Date.now()) {
        const diffDays = Math.ceil((targetTime - Date.now()) / (24 * 60 * 60 * 1000));
        days = Math.min(Math.max(diffDays, 1), 60);
      }
    } else if (typeof body.expiresInDays === "number" && body.expiresInDays > 0) {
      days = Math.min(body.expiresInDays, 60);
    }

    const token = createMasterToken(uid, days);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "kankali-context.vercel.app";
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const origin = `${proto}://${host}`;
    const masterAuthUrl = `${origin}/mcp/master?token=${token}`;

    return NextResponse.json({
      success: true,
      token,
      masterAuthUrl,
      expiresAt,
      expiresInDays: days,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
