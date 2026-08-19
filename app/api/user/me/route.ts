import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getUser } from "@/lib/users";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { uid?: string } | undefined)?.uid;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUser(uid);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Never return the encrypted token itself
  return NextResponse.json({
    uid: user.uid,
    email: user.email,
    name: user.name,
    mcpApiKey: user.mcpApiKey,
    githubOwner: user.githubOwner ?? null,
    githubRepo: user.githubRepo ?? null,
    githubBranch: user.githubBranch ?? "main",
    tokenExpiresAt: user.tokenExpiresAt ?? null,
    hasGithubToken: Boolean(user.githubTokenEnc),
    hasGoogleDrive: Boolean(user.googleRefreshTokenEnc),
    createdAt: user.createdAt,
  });
}
