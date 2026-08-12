import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { saveGithubSettings } from "@/lib/users";
import { validateGithubAccess } from "@/lib/github";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { uid?: string } | undefined)?.uid;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const token = String(body.token || "").trim();
  const owner = String(body.owner || "").trim();
  const repo = String(body.repo || "").trim();
  const branch = String(body.branch || "main").trim();
  const tokenExpiresAt = body.tokenExpiresAt
    ? String(body.tokenExpiresAt)
    : null;

  if (!token || !owner || !repo) {
    return NextResponse.json(
      { error: "token, owner, and repo are required" },
      { status: 400 }
    );
  }

  const check = await validateGithubAccess({ token, owner, repo, branch });
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const user = await saveGithubSettings(uid, {
    token,
    owner,
    repo,
    branch,
    tokenExpiresAt,
  });

  return NextResponse.json({
    ok: true,
    githubOwner: user.githubOwner,
    githubRepo: user.githubRepo,
    githubBranch: user.githubBranch,
    tokenExpiresAt: user.tokenExpiresAt,
  });
}
