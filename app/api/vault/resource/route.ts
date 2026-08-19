import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getUser, resolveGithubConfig } from "@/lib/users";
import { decrypt } from "@/lib/crypto";
import { refreshGoogleToken, writeFile as writeDriveFile, safePath as safeDrivePath } from "@/lib/drive-fs";
import { writeFile as writeGitFile, safePath as safeGitPath } from "@/lib/git-fs";
import { NextResponse } from "next/server";

function slugify(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "resource"
  );
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
    const { slug, name, title, url, description, content, target } = body;

    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Project slug is required." }, { status: 400 });
    }
    if (!name && !title) {
      return NextResponse.json({ error: "Resource name or title is required." }, { status: 400 });
    }

    const cleanSlug = slugify(slug);
    const fileName = slugify(name || title) + ".md";
    const filePath = `project/${cleanSlug}/resources/${fileName}`;
    const now = new Date().toISOString();
    const resourceTitle = title || name || fileName;

    const resourceMarkdown = `---
title: ${JSON.stringify(resourceTitle)}
project: ${cleanSlug}
url: ${JSON.stringify(url || "")}
created_at: ${now}
updated_at: ${now}
---

# ${resourceTitle}

${url ? `**Reference Link:** [${url}](${url})\n` : ""}
${description ? `## Description\n${description.trim()}\n` : ""}
${content ? `## Notes & Details\n${content.trim()}\n` : ""}
`;

    const targetStorage = target || (user.googleRefreshTokenEnc ? "drive" : "git");
    const pathsWritten: string[] = [];

    if (targetStorage === "drive" || targetStorage === "both") {
      if (user.googleRefreshTokenEnc) {
        const refreshToken = decrypt(user.googleRefreshTokenEnc);
        const accessToken = await refreshGoogleToken(refreshToken);
        await writeDriveFile(accessToken, safeDrivePath(filePath), resourceMarkdown);
        pathsWritten.push(`drive:${filePath}`);
      } else if (targetStorage === "drive") {
        return NextResponse.json({ error: "Google Drive is not linked." }, { status: 400 });
      }
    }

    if (targetStorage === "git" || targetStorage === "both") {
      const cfg = resolveGithubConfig(user);
      if (cfg) {
        await writeGitFile(
          cfg,
          safeGitPath(filePath),
          resourceMarkdown,
          `kankali: add resource ${cleanSlug}/${fileName}`
        );
        pathsWritten.push(`git:${filePath}`);
      } else if (targetStorage === "git") {
        return NextResponse.json({ error: "GitHub is not configured." }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: true,
      path: filePath,
      pathsWritten,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
