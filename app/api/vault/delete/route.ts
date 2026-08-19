import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getUser, resolveGithubConfig } from "@/lib/users";
import { decrypt } from "@/lib/crypto";
import { refreshGoogleToken } from "@/lib/drive-fs";
import { toolDeletePath as driveDeletePath } from "@/lib/tools-drive";
import { toolDeletePath as gitDeletePath } from "@/lib/tools-git";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { uid?: string } | undefined)?.uid;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUser(uid);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { source = "drive", path, confirm_token } = body;

    if (!path || typeof path !== "string") {
      return NextResponse.json({ error: "Path is required." }, { status: 400 });
    }

    if (source === "drive") {
      if (!user.googleRefreshTokenEnc) {
        return NextResponse.json({ error: "Google Drive is not linked." }, { status: 400 });
      }
      const refreshToken = decrypt(user.googleRefreshTokenEnc);
      const accessToken = await refreshGoogleToken(refreshToken);
      const res = await driveDeletePath(accessToken, { path, confirm_token }, uid);

      if (res.isError) {
        return NextResponse.json({ error: res.content[0]?.text || "Delete failed" }, { status: 400 });
      }
      const structured = res.structuredContent as Record<string, unknown> | undefined;
      return NextResponse.json({
        success: !structured?.confirmation_required,
        confirmation_required: Boolean(structured?.confirmation_required),
        confirm_token: structured?.confirm_token,
        expires_in_seconds: structured?.expires_in_seconds,
        message: res.content[0]?.text,
      });
    }

    if (source === "git") {
      const cfg = resolveGithubConfig(user);
      if (!cfg) {
        return NextResponse.json({ error: "GitHub is not connected." }, { status: 400 });
      }
      const res = await gitDeletePath(cfg, { path, confirm_token }, uid);

      if (res.isError) {
        return NextResponse.json({ error: res.content[0]?.text || "Delete failed" }, { status: 400 });
      }
      const structured = res.structuredContent as Record<string, unknown> | undefined;
      return NextResponse.json({
        success: !structured?.confirmation_required,
        confirmation_required: Boolean(structured?.confirmation_required),
        confirm_token: structured?.confirm_token,
        expires_in_seconds: structured?.expires_in_seconds,
        message: res.content[0]?.text,
      });
    }

    return NextResponse.json({ error: "Invalid source. Use 'git' or 'drive'." }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
