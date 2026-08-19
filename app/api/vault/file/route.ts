import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getUser, resolveGithubConfig } from "@/lib/users";
import { decrypt } from "@/lib/crypto";
import { refreshGoogleToken, readFile as readDriveFile, writeFile as writeDriveFile, safePath as safeDrivePath } from "@/lib/drive-fs";
import { readFile as readGitFile, writeFile as writeGitFile, safePath as safeGitPath } from "@/lib/git-fs";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { uid?: string } | undefined)?.uid;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUser(uid);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source") || "drive";
  const path = searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "Missing required 'path' query parameter." }, { status: 400 });
  }

  try {
    if (source === "drive") {
      if (!user.googleRefreshTokenEnc) {
        return NextResponse.json({ error: "Google Drive is not linked." }, { status: 400 });
      }
      const refreshToken = decrypt(user.googleRefreshTokenEnc);
      const accessToken = await refreshGoogleToken(refreshToken);
      const file = await readDriveFile(accessToken, path);

      if (!file) {
        return NextResponse.json({ error: `File not found: ${path}` }, { status: 404 });
      }
      return NextResponse.json({
        source: "drive",
        path: file.path,
        content: file.content,
        updatedAt: file.updatedAt,
        size: file.size,
      });
    }

    if (source === "git") {
      const cfg = resolveGithubConfig(user);
      if (!cfg) {
        return NextResponse.json({ error: "GitHub is not connected." }, { status: 400 });
      }
      const file = await readGitFile(cfg, path);

      if (!file) {
        return NextResponse.json({ error: `File not found: ${path}` }, { status: 404 });
      }
      return NextResponse.json({
        source: "git",
        path: file.path,
        content: file.content,
        sha: file.sha,
        size: file.size,
      });
    }

    return NextResponse.json({ error: "Invalid source parameter. Use 'git' or 'drive'." }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

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
    const { source = "drive", path, content = "" } = body;

    if (!path || typeof path !== "string") {
      return NextResponse.json({ error: "Path is required." }, { status: 400 });
    }

    if (source === "drive") {
      if (!user.googleRefreshTokenEnc) {
        return NextResponse.json({ error: "Google Drive is not linked." }, { status: 400 });
      }
      const refreshToken = decrypt(user.googleRefreshTokenEnc);
      const accessToken = await refreshGoogleToken(refreshToken);
      const written = await writeDriveFile(accessToken, safeDrivePath(path), content);
      return NextResponse.json({
        success: true,
        source: "drive",
        path: written.path,
        updatedAt: written.updatedAt,
      });
    }

    if (source === "git") {
      const cfg = resolveGithubConfig(user);
      if (!cfg) {
        return NextResponse.json({ error: "GitHub is not connected." }, { status: 400 });
      }
      const written = await writeGitFile(cfg, safeGitPath(path), content, `kankali: web update ${path}`);
      return NextResponse.json({
        success: true,
        source: "git",
        path: written.path,
        sha: written.sha,
      });
    }

    return NextResponse.json({ error: "Invalid source. Use 'git' or 'drive'." }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
