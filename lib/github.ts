/**
 * Per-user GitHub Contents API (Octokit).
 * Token / owner / repo come from the authenticated user's Firestore record.
 * Rate limit: 5,000 req/hr per PAT.
 */

import { Octokit } from "@octokit/rest";
import type { GithubConfig, ParsedContext } from "@/types";
import { parseMarkdown, buildMarkdown } from "./frontmatter";

function client(token: string) {
  return new Octokit({ auth: token });
}

function toBase64(text: string) {
  return Buffer.from(text, "utf8").toString("base64");
}
function fromBase64(b64: string) {
  return Buffer.from(b64, "base64").toString("utf8");
}

function normalizeSlug(domain: string) {
  return (
    domain
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "default"
  );
}

const CONTEXT_FILENAME = "context.md";

export async function listDomains(cfg: GithubConfig): Promise<string[]> {
  const octokit = client(cfg.token);
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: cfg.owner,
      repo: cfg.repo,
      path: "domains",
      ref: cfg.branch,
    });
    if (!Array.isArray(data)) return [];
    return data.filter((i) => i.type === "dir").map((i) => i.name).sort();
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) return [];
    throw err;
  }
}

export async function readDomain(
  cfg: GithubConfig,
  domain: string
): Promise<ParsedContext | null> {
  const slug = normalizeSlug(domain);
  const path = `domains/${slug}/${CONTEXT_FILENAME}`;
  const octokit = client(cfg.token);
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: cfg.owner,
      repo: cfg.repo,
      path,
      ref: cfg.branch,
    });
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return null;
    return parseMarkdown(fromBase64(data.content), path, data.sha);
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

export async function writeDomain(
  cfg: GithubConfig,
  params: { domain: string; body: string; origin: string; tags?: string[] }
): Promise<{ path: string; sha: string; hash: string; updated: string }> {
  const slug = normalizeSlug(params.domain);
  const path = `domains/${slug}/${CONTEXT_FILENAME}`;
  const octokit = client(cfg.token);

  let existingSha: string | undefined;
  let existingCreated: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: cfg.owner,
      repo: cfg.repo,
      path,
      ref: cfg.branch,
    });
    if (!Array.isArray(data) && data.type === "file" && "sha" in data) {
      existingSha = data.sha;
      if ("content" in data && data.content) {
        const prev = parseMarkdown(fromBase64(data.content), path, data.sha);
        existingCreated = prev.frontmatter.created;
      }
    }
  } catch (err: unknown) {
    if ((err as { status?: number })?.status !== 404) throw err;
  }

  const { raw, hash, frontmatter } = buildMarkdown(params.body, {
    origin: params.origin,
    domain: slug,
    tags: params.tags,
    created: existingCreated,
  });

  const payload: Parameters<typeof octokit.rest.repos.createOrUpdateFileContents>[0] = {
    owner: cfg.owner,
    repo: cfg.repo,
    path,
    message: `kankali: write context [${params.origin}] → ${slug}`,
    content: toBase64(raw),
    branch: cfg.branch,
  };
  if (existingSha) payload.sha = existingSha;

  const { data } = await octokit.rest.repos.createOrUpdateFileContents(payload);
  return {
    path,
    sha: data.content?.sha ?? "",
    hash,
    updated: frontmatter.updated,
  };
}

export async function appendActivityLog(cfg: GithubConfig, line: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const path = `activity-log/${today}.md`;
  const octokit = client(cfg.token);

  let existingSha: string | undefined;
  let existingContent = `# Activity log — ${today}\n\n`;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: cfg.owner,
      repo: cfg.repo,
      path,
      ref: cfg.branch,
    });
    if (!Array.isArray(data) && data.type === "file" && "content" in data) {
      existingSha = data.sha;
      existingContent = fromBase64(data.content);
      if (!existingContent.endsWith("\n")) existingContent += "\n";
    }
  } catch (err: unknown) {
    if ((err as { status?: number })?.status !== 404) throw err;
  }

  const payload: Parameters<typeof octokit.rest.repos.createOrUpdateFileContents>[0] = {
    owner: cfg.owner,
    repo: cfg.repo,
    path,
    message: `kankali: activity log ${today}`,
    content: toBase64(existingContent + line + "\n"),
    branch: cfg.branch,
  };
  if (existingSha) payload.sha = existingSha;
  await octokit.rest.repos.createOrUpdateFileContents(payload);
}

export async function listMarkdownPaths(cfg: GithubConfig): Promise<string[]> {
  const octokit = client(cfg.token);
  try {
    const { data: refData } = await octokit.rest.git.getRef({
      owner: cfg.owner,
      repo: cfg.repo,
      ref: `heads/${cfg.branch}`,
    });
    const { data: commit } = await octokit.rest.git.getCommit({
      owner: cfg.owner,
      repo: cfg.repo,
      commit_sha: refData.object.sha,
    });
    const { data: tree } = await octokit.rest.git.getTree({
      owner: cfg.owner,
      repo: cfg.repo,
      tree_sha: commit.tree.sha,
      recursive: "true",
    });
    return (tree.tree ?? [])
      .filter(
        (i) =>
          i.type === "blob" &&
          i.path?.endsWith(".md") &&
          (i.path.startsWith("domains/") || i.path.startsWith("global/"))
      )
      .map((i) => i.path as string);
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) return [];
    throw err;
  }
}

export async function fetchFileRaw(
  cfg: GithubConfig,
  path: string
): Promise<{ raw: string; sha: string } | null> {
  const octokit = client(cfg.token);
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: cfg.owner,
      repo: cfg.repo,
      path,
      ref: cfg.branch,
    });
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return null;
    return { raw: fromBase64(data.content), sha: data.sha };
  } catch {
    return null;
  }
}

/** Validate a token can access the given repo (used on settings save). */
export async function validateGithubAccess(cfg: GithubConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const octokit = client(cfg.token);
    await octokit.rest.repos.get({ owner: cfg.owner, repo: cfg.repo });
    return { ok: true };
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 401) return { ok: false, error: "Invalid GitHub token" };
    if (status === 404) return { ok: false, error: "Repo not found or token lacks access" };
    return { ok: false, error: err instanceof Error ? err.message : "GitHub validation failed" };
  }
}
