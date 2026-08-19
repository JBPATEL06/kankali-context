/**
 * High-performance Markdown Heading AST & Anchor-Based Chunking Engine for Kankali MCP.
 * Enables Progressive Disclosure:
 * 1. extractOutline() -> Generates lightweight Table of Contents with line numbers, anchor slugs, and byte sizes.
 * 2. getSectionChunk() -> Extracts only the requested heading block (~1-3 KB instead of 50-500 KB).
 * 3. replaceSectionChunk() -> In-place replacement of a specific heading block without touching the rest of the file.
 */

export interface MarkdownSection {
  level: number; // 1 for #, 2 for ##, 3 for ###
  rawHeading: string; // e.g. "## [auth-flow] Authentication & OAuth"
  cleanTitle: string; // e.g. "Authentication & OAuth"
  anchor: string; // e.g. "auth-flow" or "authentication-oauth"
  startLine: number; // 1-indexed
  endLine: number; // 1-indexed
  byteSize: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[([^\]]+)\]/g, "$1") // extract anchor inside brackets
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function parseHeadingLine(line: string): { level: number; cleanTitle: string; anchor: string } | null {
  const match = line.match(/^(#{1,6})\s+(.*)$/);
  if (!match) return null;

  const hashes = match[1] || "";
  const level = hashes.length;
  const rawText = (match[2] || "").trim();

  // Check if explicit anchor is provided: e.g. "## [auth-flow] Authentication" or "## Authentication {#auth-flow}"
  const bracketMatch = rawText.match(/^\[([^\]]+)\]\s*(.*)$/);
  const braceMatch = rawText.match(/^(.*?)\s*\{#([^\}]+)\}$/);

  if (bracketMatch && bracketMatch[1]) {
    const anchor = slugify(bracketMatch[1]);
    const cleanTitle = bracketMatch[2]?.trim() || bracketMatch[1];
    return { level, cleanTitle, anchor };
  }

  if (braceMatch && braceMatch[2]) {
    const anchor = slugify(braceMatch[2]);
    const cleanTitle = braceMatch[1]?.trim() || anchor;
    return { level, cleanTitle, anchor };
  }

  const cleanTitle = rawText;
  const anchor = slugify(rawText);
  return { level, cleanTitle, anchor };
}

/**
 * Scans markdown text and extracts all headings with line boundaries and anchor slugs.
 */
export function parseMarkdownSections(content: string): MarkdownSection[] {
  const lines = content.split(/\r?\n/);
  const headings: Array<{
    level: number;
    rawHeading: string;
    cleanTitle: string;
    anchor: string;
    lineIndex: number;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";
    const parsed = parseHeadingLine(line);
    if (parsed) {
      headings.push({
        level: parsed.level,
        rawHeading: line,
        cleanTitle: parsed.cleanTitle,
        anchor: parsed.anchor,
        lineIndex: i,
      });
    }
  }

  if (headings.length === 0) return [];

  const sections: MarkdownSection[] = [];

  for (let i = 0; i < headings.length; i++) {
    const curr = headings[i];
    if (!curr) continue;
    const startLine = curr.lineIndex + 1; // 1-indexed

    // End line is before the next heading of equal or higher level, or EOF
    let endLineIndex = lines.length - 1;
    for (let j = i + 1; j < headings.length; j++) {
      const nextH = headings[j];
      if (nextH && nextH.level <= curr.level) {
        endLineIndex = nextH.lineIndex - 1;
        break;
      }
    }

    const sectionLines = lines.slice(curr.lineIndex, endLineIndex + 1);
    const byteSize = Buffer.byteLength(sectionLines.join("\n"), "utf8");

    sections.push({
      level: curr.level,
      rawHeading: curr.rawHeading,
      cleanTitle: curr.cleanTitle,
      anchor: curr.anchor,
      startLine,
      endLine: endLineIndex + 1,
      byteSize,
    });
  }

  return sections;
}

/**
 * Generates a clean Table of Contents outline for a Markdown document.
 */
export function extractOutline(filePath: string, content: string): string {
  const sections = parseMarkdownSections(content);
  const totalBytes = Buffer.byteLength(content, "utf8");
  const totalLines = content.split(/\r?\n/).length;

  if (sections.length === 0) {
    return `# Outline: ${filePath} (${totalLines} lines, ${(totalBytes / 1024).toFixed(1)} KB)
*No Markdown headings found. File contains plain unstructured content.*`;
  }

  const lines: string[] = [];
  lines.push(`# Outline: ${filePath} (${totalLines} lines, ${(totalBytes / 1024).toFixed(1)} KB)`);
  lines.push(`*Use \`read_file(path: "${filePath}", section: "<anchor>")\` to read any specific block without loading the entire file.*\n`);

  for (const s of sections) {
    const indent = "  ".repeat(Math.max(0, s.level - 1));
    const sizeStr = s.byteSize > 1024 ? `${(s.byteSize / 1024).toFixed(1)} KB` : `${s.byteSize} B`;
    lines.push(
      `${indent}- **[${s.anchor}]** ${s.cleanTitle} *(Lines ${s.startLine}–${s.endLine}, ${sizeStr})*`
    );
  }

  return lines.join("\n");
}

/**
 * Extracts only the requested heading block from markdown content.
 */
export function getSectionChunk(
  content: string,
  sectionQuery: string
): { found: boolean; chunk?: string; section?: MarkdownSection; availableAnchors?: string[] } {
  const sections = parseMarkdownSections(content);
  if (sections.length === 0) {
    return { found: false, availableAnchors: [] };
  }

  const q = slugify(sectionQuery);
  const cleanQ = sectionQuery.toLowerCase().trim();

  const matched = sections.find(
    (s) =>
      s.anchor === q ||
      s.anchor.includes(q) ||
      s.cleanTitle.toLowerCase().includes(cleanQ) ||
      s.rawHeading.toLowerCase().includes(cleanQ)
  );

  if (!matched) {
    return {
      found: false,
      availableAnchors: sections.map((s) => `[${s.anchor}] ${s.cleanTitle}`),
    };
  }

  const lines = content.split(/\r?\n/);
  const chunkLines = lines.slice(matched.startLine - 1, matched.endLine);
  const chunk = chunkLines.join("\n");

  return {
    found: true,
    chunk,
    section: matched,
  };
}

/**
 * Replaces a specific heading block with new content without modifying the surrounding file.
 */
export function replaceSectionChunk(
  content: string,
  sectionQuery: string,
  newSectionContent: string
): { success: boolean; updatedContent: string; replacedAnchor?: string; error?: string } {
  const sections = parseMarkdownSections(content);
  if (sections.length === 0) {
    return { success: false, updatedContent: content, error: "No markdown headings found to replace." };
  }

  const q = slugify(sectionQuery);
  const cleanQ = sectionQuery.toLowerCase().trim();

  const matched = sections.find(
    (s) =>
      s.anchor === q ||
      s.anchor.includes(q) ||
      s.cleanTitle.toLowerCase().includes(cleanQ) ||
      s.rawHeading.toLowerCase().includes(cleanQ)
  );

  if (!matched) {
    const available = sections.map((s) => s.anchor).join(", ");
    return {
      success: false,
      updatedContent: content,
      error: `Section '${sectionQuery}' not found. Available anchors: ${available}`,
    };
  }

  const lines = content.split(/\r?\n/);
  const beforeLines = lines.slice(0, matched.startLine - 1);
  const afterLines = lines.slice(matched.endLine);

  const cleanNew = newSectionContent.trim();
  const assembled = [...beforeLines, cleanNew, ...afterLines].join("\n");

  return {
    success: true,
    updatedContent: assembled,
    replacedAnchor: matched.anchor,
  };
}
