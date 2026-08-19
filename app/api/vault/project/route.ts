import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getUser, resolveGithubConfig } from "@/lib/users";
import { decrypt } from "@/lib/crypto";
import { refreshGoogleToken } from "@/lib/drive-fs";
import { toolProjectUpsert as driveProjectUpsert } from "@/lib/tools-drive";
import { toolProjectUpsert as gitProjectUpsert } from "@/lib/tools-project";
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
    const { slug, name, stack, status, repo_url, summary, key_decisions, target } = body;

    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Project slug is required." }, { status: 400 });
    }

    const targetStorage = target || (user.googleRefreshTokenEnc ? "drive" : "git");
    const results: Record<string, unknown> = {};

    if (targetStorage === "drive" || targetStorage === "both") {
      if (!user.googleRefreshTokenEnc) {
        if (targetStorage === "drive") {
          return NextResponse.json(
            { error: "Google Drive is not linked. Please connect Google Drive in Settings." },
            { status: 400 }
          );
        }
      } else {
        const refreshToken = decrypt(user.googleRefreshTokenEnc);
        const accessToken = await refreshGoogleToken(refreshToken);
        const driveRes = await driveProjectUpsert(accessToken, {
          slug,
          name,
          stack,
          status,
          repo_url,
          summary,
          key_decisions,
        });
        results.drive = driveRes;
      }
    }

    if (targetStorage === "git" || targetStorage === "both") {
      const cfg = resolveGithubConfig(user);
      if (!cfg) {
        if (targetStorage === "git") {
          return NextResponse.json(
            { error: "GitHub is not configured. Please save PAT & repo in Settings." },
            { status: 400 }
          );
        }
      } else {
        const gitRes = await gitProjectUpsert(cfg, {
          slug,
          name,
          stack,
          status,
          repo_url,
          summary,
          key_decisions,
        });
        results.git = gitRes;
      }
    }

    return NextResponse.json({
      success: true,
      slug,
      target: targetStorage,
      results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
