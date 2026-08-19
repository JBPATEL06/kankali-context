import YAML from "yaml";
import { sha256 } from "./crypto";
import type { ContextFrontmatter, ParsedContext } from "@/types";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseMarkdown(raw: string, path: string, sha?: string): ParsedContext {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return {
      frontmatter: {
        origin: "unknown",
        domain: "",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        tags: [],
        hash: sha256(raw),
      },
      body: raw.trim(),
      raw,
      sha,
      path,
    };
  }

  let data: Record<string, unknown> = {};
  try {
    data = YAML.parse(match[1]) ?? {};
  } catch {
    /* treat as body */
  }

  const body = (match[2] ?? "").trim();
  const tags = Array.isArray(data.tags)
    ? data.tags.map(String)
    : typeof data.tags === "string"
      ? [data.tags]
      : [];

  return {
    frontmatter: {
      origin: String(data.origin ?? "unknown"),
      domain: String(data.domain ?? ""),
      created: String(data.created ?? new Date().toISOString()),
      updated: String(data.updated ?? new Date().toISOString()),
      tags,
      hash: String(data.hash ?? sha256(body)),
    },
    body,
    raw,
    sha,
    path,
  };
}

export function buildMarkdown(
  body: string,
  meta: { origin: string; domain: string; tags?: string[]; created?: string }
): { raw: string; hash: string; frontmatter: ContextFrontmatter } {
  const now = new Date().toISOString();
  const hash = sha256(body);
  const frontmatter: ContextFrontmatter = {
    origin: meta.origin,
    domain: meta.domain,
    created: meta.created ?? now,
    updated: now,
    tags: meta.tags ?? [],
    hash,
  };
  const yaml = YAML.stringify(frontmatter).trimEnd();
  const raw = `---\n${yaml}\n---\n\n${body.trim()}\n`;
  return { raw, hash, frontmatter };
}
