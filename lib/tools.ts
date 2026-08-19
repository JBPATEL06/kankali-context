import { z } from "zod";
import {
  listDomains,
  readDomain,
  writeDomain,
  appendActivityLog,
  listMarkdownPaths,
  fetchFileRaw,
} from "./github";
import { parseMarkdown } from "./frontmatter";
import type { GithubConfig, Origin } from "@/types";

export const listDomainsSchema = z.object({});

export async function toolListDomains(cfg: GithubConfig) {
  const domains = await listDomains(cfg);
  const text =
    domains.length === 0
      ? "No domains found. Write context to a domain to create one."
      : `Domains:\n${domains.map((d) => `- ${d}`).join("\n")}`;
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: { domains },
  };
}

export const readContextSchema = z.object({
  domain: z.string().describe("Domain slug, e.g. 'side-project-x'"),
  filter: z.string().optional().describe("Optional keyword filter"),
});

export async function toolReadContext(
  cfg: GithubConfig,
  args: z.infer<typeof readContextSchema>
) {
  const ctx = await readDomain(cfg, args.domain);
  if (!ctx) {
    return {
      content: [
        {
          type: "text" as const,
          text: `No context found for domain "${args.domain}". Use write_context to create it.`,
        },
      ],
      structuredContent: { found: false, domain: args.domain },
    };
  }

  if (args.filter) {
    const q = args.filter.toLowerCase();
    const hay = (
      ctx.body +
      " " +
      ctx.frontmatter.tags.join(" ") +
      " " +
      ctx.frontmatter.origin
    ).toLowerCase();
    if (!hay.includes(q)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Context for "${args.domain}" exists but does not match filter "${args.filter}".`,
          },
        ],
        structuredContent: { found: true, matched: false },
      };
    }
  }

  const header = [
    `domain: ${ctx.frontmatter.domain}`,
    `origin: ${ctx.frontmatter.origin}`,
    `updated: ${ctx.frontmatter.updated}`,
    `tags: [${ctx.frontmatter.tags.join(", ")}]`,
  ].join("\n");

  return {
    content: [{ type: "text" as const, text: `---\n${header}\n---\n\n${ctx.body}` }],
    structuredContent: {
      found: true,
      domain: ctx.frontmatter.domain,
      origin: ctx.frontmatter.origin,
      updated: ctx.frontmatter.updated,
      tags: ctx.frontmatter.tags,
      hash: ctx.frontmatter.hash,
      body: ctx.body,
    },
  };
}

export const writeContextSchema = z.object({
  domain: z.string().describe("Domain slug (auto-created if missing)"),
  content: z.string().describe("Markdown body to store"),
  tags: z.array(z.string()).optional(),
  origin: z
    .string()
    .optional()
    .describe("Optional origin tag, e.g. claude | grok (defaults to 'user')"),
});

export async function toolWriteContext(
  cfg: GithubConfig,
  args: z.infer<typeof writeContextSchema>,
  defaultOrigin: Origin
) {
  const origin = (args.origin || defaultOrigin || "user") as Origin;
  const result = await writeDomain(cfg, {
    domain: args.domain,
    body: args.content,
    origin,
    tags: args.tags,
  });

  const preview = args.content.trim().slice(0, 80).replace(/\n/g, " ");
  const domainSlug = result.path.split("/")[1] ?? args.domain;
  const logLine = `- ${new Date().toISOString()} | origin=${origin} | domain=${domainSlug} | action=write | hash=${result.hash.slice(0, 12)}… | preview=${preview}`;
  try {
    await appendActivityLog(cfg, logLine);
  } catch {
    /* non-fatal */
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `Context written.\npath: ${result.path}\norigin: ${origin}\nhash: ${result.hash}\nupdated: ${result.updated}`,
      },
    ],
    structuredContent: {
      path: result.path,
      sha: result.sha,
      hash: result.hash,
      origin,
      updated: result.updated,
    },
  };
}

export const searchContextSchema = z.object({
  query: z.string().describe("Keyword search (case-insensitive)"),
  domain: z.string().optional(),
});

export async function toolSearchContext(
  cfg: GithubConfig,
  args: z.infer<typeof searchContextSchema>
) {
  const q = args.query.toLowerCase().trim();
  if (!q) {
    return { content: [{ type: "text" as const, text: "Empty query." }], isError: true };
  }

  let paths = await listMarkdownPaths(cfg);
  if (args.domain) {
    const slug = args.domain.toLowerCase();
    paths = paths.filter(
      (p) => p.includes(`/domains/${slug}/`) || p === `domains/${slug}/context.md`
    );
  }

  const hits: Array<{
    path: string;
    origin: string;
    domain: string;
    snippet: string;
    tags: string[];
  }> = [];

  for (const path of paths.slice(0, 40)) {
    const file = await fetchFileRaw(cfg, path);
    if (!file) continue;
    const parsed = parseMarkdown(file.raw, path, file.sha);
    const hay = (
      parsed.body +
      " " +
      parsed.frontmatter.tags.join(" ") +
      " " +
      parsed.frontmatter.origin
    ).toLowerCase();
    if (!hay.includes(q)) continue;

    const idx = parsed.body.toLowerCase().indexOf(q);
    let snippet = parsed.body;
    if (idx >= 0) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(parsed.body.length, idx + q.length + 60);
      snippet =
        (start > 0 ? "…" : "") +
        parsed.body.slice(start, end) +
        (end < parsed.body.length ? "…" : "");
    } else {
      snippet = parsed.body.slice(0, 120) + (parsed.body.length > 120 ? "…" : "");
    }
    hits.push({
      path,
      origin: parsed.frontmatter.origin,
      domain: parsed.frontmatter.domain || path.split("/")[1] || "",
      snippet: snippet.replace(/\n/g, " "),
      tags: parsed.frontmatter.tags,
    });
  }

  if (hits.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `No matches for "${args.query}"${args.domain ? ` in domain "${args.domain}"` : ""}.`,
        },
      ],
      structuredContent: { hits: [], query: args.query },
    };
  }

  const text = hits
    .map(
      (h, i) =>
        `${i + 1}. [${h.domain}] origin=${h.origin} tags=[${h.tags.join(",")}]\n   ${h.snippet}\n   path: ${h.path}`
    )
    .join("\n\n");

  return {
    content: [{ type: "text" as const, text: `Found ${hits.length} match(es):\n\n${text}` }],
    structuredContent: { hits, query: args.query },
  };
}
