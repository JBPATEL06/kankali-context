"use client";

import React, { useMemo } from "react";

interface MarkdownPreviewProps {
  content: string;
}

interface Frontmatter {
  attributes: Record<string, string>;
  body: string;
}

function parseFrontmatter(raw: string): Frontmatter {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("---")) {
    return { attributes: {}, body: raw };
  }

  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { attributes: {}, body: raw };
  }

  const yamlBlock = match[1];
  const body = match[2];
  const attributes: Record<string, string> = {};

  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key) attributes[key] = val;
    }
  }

  return { attributes, body };
}

function renderInlineText(text: string): React.ReactNode {
  // Regex pattern for bold, code, links, and italic
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // Check for inline code `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code
          key={keyIdx++}
          style={{
            background: "rgba(56, 189, 248, 0.12)",
            color: "var(--primary)",
            padding: "0.15rem 0.4rem",
            borderRadius: "4px",
            fontSize: "0.85em",
            fontFamily: "var(--font-mono)",
            border: "1px solid rgba(56, 189, 248, 0.2)",
          }}
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Check for markdown link [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a
          key={keyIdx++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--primary)",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
          }}
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Check for bold **text**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(
        <strong key={keyIdx++} style={{ color: "#ffffff", fontWeight: 700 }}>
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Check for italic *text* or _text_
    const italicMatch = remaining.match(/^(\*|_)([^*_]+)\1/);
    if (italicMatch) {
      parts.push(
        <em key={keyIdx++} style={{ color: "var(--on-surface)", fontStyle: "italic" }}>
          {italicMatch[2]}
        </em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Regular character accumulation
    const nextSpecial = remaining.search(/[`*\[_]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // Fallback single character if unmatched
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const { attributes, body } = useMemo(() => parseFrontmatter(content), [content]);

  // Tokenize markdown into blocks (Headers, Tables, Lists, Code blocks, Paragraphs, Quotes)
  const renderedBlocks = useMemo(() => {
    const lines = body.split(/\r?\n/);
    const blocks: React.ReactNode[] = [];
    let i = 0;
    let blockKey = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        i++;
        continue;
      }

      // 1. Code Block ```
      if (trimmed.startsWith("```")) {
        const lang = trimmed.slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++; // skip closing ```

        blocks.push(
          <div
            key={blockKey++}
            style={{
              margin: "1.25rem 0",
              background: "#04070d",
              borderRadius: "6px",
              border: "1px solid var(--border-subtle)",
              overflow: "hidden",
            }}
          >
            {lang && (
              <div
                style={{
                  padding: "0.35rem 0.75rem",
                  background: "rgba(255, 255, 255, 0.03)",
                  borderBottom: "1px solid var(--border-subtle)",
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--primary)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {lang}
              </div>
            )}
            <pre
              style={{
                margin: 0,
                padding: "1rem",
                overflowX: "auto",
                fontFamily: "var(--font-mono)",
                fontSize: "0.85rem",
                lineHeight: 1.6,
                color: "var(--on-surface)",
              }}
            >
              {codeLines.join("\n")}
            </pre>
          </div>
        );
        continue;
      }

      // 2. Headings (#, ##, ###, ####)
      if (trimmed.startsWith("# ")) {
        blocks.push(
          <h1
            key={blockKey++}
            style={{
              fontSize: "1.65rem",
              fontWeight: 800,
              color: "#ffffff",
              margin: "1.75rem 0 0.75rem",
              paddingBottom: "0.5rem",
              borderBottom: "1px solid var(--border-subtle)",
              letterSpacing: "-0.02em",
            }}
          >
            {renderInlineText(trimmed.slice(2))}
          </h1>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith("## ")) {
        blocks.push(
          <h2
            key={blockKey++}
            style={{
              fontSize: "1.3rem",
              fontWeight: 700,
              color: "var(--color-cyan-light)",
              margin: "1.5rem 0 0.6rem",
              letterSpacing: "-0.01em",
            }}
          >
            {renderInlineText(trimmed.slice(3))}
          </h2>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith("### ")) {
        blocks.push(
          <h3
            key={blockKey++}
            style={{
              fontSize: "1.1rem",
              fontWeight: 600,
              color: "#ffffff",
              margin: "1.25rem 0 0.5rem",
            }}
          >
            {renderInlineText(trimmed.slice(4))}
          </h3>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith("#### ")) {
        blocks.push(
          <h4
            key={blockKey++}
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              color: "var(--primary)",
              margin: "1rem 0 0.4rem",
            }}
          >
            {renderInlineText(trimmed.slice(5))}
          </h4>
        );
        i++;
        continue;
      }

      // 3. Horizontal Rule (---, ***)
      if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
        blocks.push(
          <hr
            key={blockKey++}
            style={{
              border: "none",
              borderTop: "1px solid var(--border-subtle)",
              margin: "1.75rem 0",
            }}
          />
        );
        i++;
        continue;
      }

      // 4. Blockquotes & Alerts (> [!NOTE], > text)
      if (trimmed.startsWith(">")) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
          i++;
        }

        const isAlert = quoteLines[0]?.startsWith("[!");
        let alertType = "note";
        let alertTitle = "NOTE";
        let alertContent = quoteLines;

        if (isAlert) {
          const match = quoteLines[0].match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
          if (match) {
            alertType = match[1].toLowerCase();
            alertTitle = match[1].toUpperCase();
            alertContent = quoteLines.slice(1);
          }
        }

        const alertColor =
          alertType === "warning" || alertType === "caution"
            ? "var(--status-critical)"
            : alertType === "tip"
            ? "var(--color-mint)"
            : "var(--primary)";

        blocks.push(
          <blockquote
            key={blockKey++}
            style={{
              margin: "1.25rem 0",
              padding: "0.75rem 1.1rem",
              borderRadius: "6px",
              background: "rgba(6, 14, 32, 0.6)",
              borderLeft: `4px solid ${alertColor}`,
              borderTop: "1px solid var(--border-subtle)",
              borderRight: "1px solid var(--border-subtle)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            {isAlert && (
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: alertColor,
                  marginBottom: "0.35rem",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {alertTitle}
              </div>
            )}
            <div style={{ fontSize: "0.88rem", color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
              {alertContent.map((qLine, qIdx) => (
                <p key={qIdx} style={{ margin: qIdx === 0 ? 0 : "0.4rem 0 0" }}>
                  {renderInlineText(qLine)}
                </p>
              ))}
            </div>
          </blockquote>
        );
        continue;
      }

      // 5. GFM Tables (| header | header |)
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
          tableLines.push(lines[i].trim());
          i++;
        }

        if (tableLines.length >= 2) {
          const headerRow = tableLines[0]
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim());
          // tableLines[1] is separator |---|---|
          const dataRows = tableLines.slice(2).map((r) =>
            r
              .slice(1, -1)
              .split("|")
              .map((c) => c.trim())
          );

          blocks.push(
            <div
              key={blockKey++}
              style={{
                margin: "1.25rem 0",
                overflowX: "auto",
                borderRadius: "6px",
                border: "1px solid var(--border-subtle)",
                background: "rgba(0, 0, 0, 0.2)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.85rem",
                  textAlign: "left",
                }}
              >
                <thead>
                  <tr style={{ background: "rgba(56, 189, 248, 0.08)", borderBottom: "1px solid var(--border-subtle)" }}>
                    {headerRow.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        style={{
                          padding: "0.6rem 0.85rem",
                          color: "#ffffff",
                          fontWeight: 600,
                          fontSize: "0.825rem",
                          borderRight: hIdx < headerRow.length - 1 ? "1px solid var(--border-subtle)" : "none",
                        }}
                      >
                        {renderInlineText(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      style={{
                        borderBottom: rIdx < dataRows.length - 1 ? "1px solid rgba(255, 255, 255, 0.05)" : "none",
                        background: rIdx % 2 === 1 ? "rgba(255, 255, 255, 0.015)" : "transparent",
                      }}
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            padding: "0.55rem 0.85rem",
                            color: "var(--on-surface)",
                            borderRight: cIdx < row.length - 1 ? "1px solid rgba(255, 255, 255, 0.05)" : "none",
                            lineHeight: 1.5,
                          }}
                        >
                          {renderInlineText(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      // 6. Unordered / Ordered Lists (- item, * item, 1. item)
      if (trimmed.match(/^([-*]|\d+\.)\s/)) {
        const listItems: { text: string; ordered: boolean }[] = [];
        while (i < lines.length && lines[i].trim().match(/^([-*]|\d+\.)\s/)) {
          const itemTrimmed = lines[i].trim();
          const isOrdered = /^\d+\.\s/.test(itemTrimmed);
          const itemText = itemTrimmed.replace(/^([-*]|\d+\.)\s+/, "");
          listItems.push({ text: itemText, ordered: isOrdered });
          i++;
        }

        const isOrderedList = listItems[0]?.ordered;
        if (isOrderedList) {
          blocks.push(
            <ol
              key={blockKey++}
              style={{
                margin: "0.75rem 0",
                paddingLeft: "1.4rem",
                color: "var(--on-surface)",
                fontSize: "0.88rem",
                lineHeight: 1.65,
              }}
            >
              {listItems.map((li, lIdx) => (
                <li key={lIdx} style={{ margin: "0.3rem 0" }}>
                  {renderInlineText(li.text)}
                </li>
              ))}
            </ol>
          );
        } else {
          blocks.push(
            <ul
              key={blockKey++}
              style={{
                margin: "0.75rem 0",
                paddingLeft: "1.25rem",
                color: "var(--on-surface)",
                fontSize: "0.88rem",
                lineHeight: 1.65,
              }}
            >
              {listItems.map((li, lIdx) => (
                <li key={lIdx} style={{ margin: "0.3rem 0" }}>
                  {renderInlineText(li.text)}
                </li>
              ))}
            </ul>
          );
        }
        continue;
      }

      // 7. Regular Paragraph
      blocks.push(
        <p
          key={blockKey++}
          style={{
            fontSize: "0.9rem",
            color: "var(--on-surface)",
            lineHeight: 1.7,
            margin: "0.75rem 0",
          }}
        >
          {renderInlineText(trimmed)}
        </p>
      );
      i++;
    }

    return blocks;
  }, [body]);

  const hasFrontmatter = Object.keys(attributes).length > 0;

  return (
    <div style={{ maxWidth: "100%", wordBreak: "break-word" }}>
      {/* Frontmatter Metadata Pill Card */}
      {hasFrontmatter && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "0.85rem 1.1rem",
            borderRadius: "6px",
            background: "rgba(6, 14, 32, 0.6)",
            border: "1px solid var(--border-subtle)",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem 1.5rem",
            alignItems: "center",
          }}
        >
          {Object.entries(attributes).map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}>
              <span style={{ color: "var(--text-muted)", textTransform: "uppercase", fontSize: "0.7rem", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                {k}:
              </span>
              <span
                style={{
                  color: k === "status" ? "var(--color-mint)" : "#ffffff",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  background: "rgba(255, 255, 255, 0.04)",
                  padding: "0.1rem 0.4rem",
                  borderRadius: "3px",
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Rendered Markdown Body */}
      <div>{renderedBlocks}</div>
    </div>
  );
}
