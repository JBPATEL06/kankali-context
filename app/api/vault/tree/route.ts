import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getUser, resolveGithubConfig } from "@/lib/users";
import { decrypt } from "@/lib/crypto";
import { refreshGoogleToken, listTree as listDriveTree, listDir as listDriveDir } from "@/lib/drive-fs";
import { listTree as listGitTree, listDir as listGitDir } from "@/lib/git-fs";
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
  const source = searchParams.get("source") || (user.googleRefreshTokenEnc ? "drive" : "git");
  const path = searchParams.get("path") || "";
  const recursive = searchParams.get("recursive") === "true";

  try {
    if (source === "drive") {
      if (!user.googleRefreshTokenEnc) {
        return NextResponse.json(
          { error: "Google Drive is not linked. Please connect Google Drive in Settings." },
          { status: 400 }
        );
      }
      const refreshToken = decrypt(user.googleRefreshTokenEnc);
      const accessToken = await refreshGoogleToken(refreshToken);

      if (recursive) {
        const tree = await listDriveTree(accessToken, path);
        return NextResponse.json({ source: "drive", entries: tree, rootPath: path });
      }
      const entries = await listDriveDir(accessToken, path);
      return NextResponse.json({ source: "drive", entries, rootPath: path });
    }

    if (source === "git") {
      const cfg = resolveGithubConfig(user);
      if (!cfg) {
        return NextResponse.json(
          { error: "GitHub is not connected. Please save PAT & repo in Settings." },
          { status: 400 }
        );
      }

      if (recursive) {
        const tree = await listGitTree(cfg, path);
        return NextResponse.json({ source: "git", entries: tree, rootPath: path });
      }
      const entries = await listGitDir(cfg, path);
      return NextResponse.json({ source: "git", entries, rootPath: path });
    }

    return NextResponse.json({ error: "Invalid source parameter. Use 'git' or 'drive'." }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
