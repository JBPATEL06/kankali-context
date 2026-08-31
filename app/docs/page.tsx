"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<"getting-started" | "skills" | "spec" | "auth" | "architecture">("getting-started");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copyCode(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const masterConnectorUrl = "https://kankali-context.vercel.app/mcp/master";
  const gitConnectorUrl = "https://kankali-context.vercel.app/mcp/git";
  const driveConnectorUrl = "https://kankali-context.vercel.app/mcp/Drive";

  const claudeDesktopConfig = `{
  "mcpServers": {
    "kankali-master": {
      "url": "https://kankali-context.vercel.app/mcp/master",
      "headers": {
        "Authorization": "Bearer <YOUR_KANKALI_MCP_API_KEY>"
      }
    },
    "kankali-drive": {
      "url": "https://kankali-context.vercel.app/mcp/Drive",
      "headers": {
        "Authorization": "Bearer <YOUR_KANKALI_MCP_API_KEY>"
      }
    },
    "kankali-git": {
      "url": "https://kankali-context.vercel.app/mcp/git",
      "headers": {
        "Authorization": "Bearer <YOUR_KANKALI_MCP_API_KEY>"
      }
    }
  }
}`;

  const agentSkillConfig = `{
  "name": "kankali-context-sync",
  "description": "Automatic personal memory and persistent context synchronization for AI assistants via Kankali MCP Master Server",
  "mcpServer": {
    "url": "https://kankali-context.vercel.app/mcp/master",
    "auth": "bearer",
    "scopes": ["mcp:tools"]
  },
  "tools": [
    "read_notice",
    "read_index",
    "read_outline",
    "read_file",
    "write_file",
    "delete_path",
    "search_files",
    "project_upsert",
    "project_get",
    "project_list",
    "current_session_set",
    "current_session_get"
  ]
}`;

  const initSdkSnippet = `import { KankaliClient } from '@kankali/sdk';

// Initialize the transport client targeting Master Dual-Cloud endpoint
const client = new KankaliClient({
  apiKey: process.env.KANKALI_API_KEY,
  ingressUrl: 'https://kankali-context.vercel.app/mcp/master',
  tls: {
    rejectUnauthorized: true
  }
});

await client.connect();
console.log('Kankali Master Session established:', client.sessionId);`;

  const publishSnippet = `// Progressive anchor read example
const outline = await client.readOutline({ path: "architecture.md" });
console.log("Document Headings:", outline.headings);

// Scoped heading read (saves 90%+ tokens)
const authSection = await client.readFile({ 
  path: "architecture.md", 
  section: "auth-flow" 
});

// Update specific heading without overwriting rest of file
await client.writeFile({
  path: "architecture.md",
  section: "auth-flow",
  content: "## auth-flow\\nUpdated OAuth 2.1 specifications..."
});`;

  return (
    <div>
      {/* Top Navigation Bar */}
      <Navbar />

      {/* 3-Column Documentation Container */}
      <div className="docs-container">
        {/* 1. Left Sidebar Navigation */}
        <aside className="docs-sidebar-left">
          <div>
            <div className="docs-nav-section-title">Developer Guide</div>
            <ul className="docs-nav-list">
              <li>
                <button
                  type="button"
                  onClick={() => setActiveTab("getting-started")}
                  className={`docs-nav-item ${activeTab === "getting-started" ? "docs-nav-item--active" : ""}`}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                >
                  🚀 Getting Started
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveTab("skills")}
                  className={`docs-nav-item ${activeTab === "skills" ? "docs-nav-item--active" : ""}`}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                >
                  ⚡ Install Agent Skill
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveTab("spec")}
                  className={`docs-nav-item ${activeTab === "spec" ? "docs-nav-item--active" : ""}`}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                >
                  🛠️ MCP Tool Reference
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveTab("auth")}
                  className={`docs-nav-item ${activeTab === "auth" ? "docs-nav-item--active" : ""}`}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                >
                  🔒 OAuth 2.1 & Tokens
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveTab("architecture")}
                  className={`docs-nav-item ${activeTab === "architecture" ? "docs-nav-item--active" : ""}`}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                >
                  🏛️ Vault Architecture
                </button>
              </li>
            </ul>
          </div>

          <div>
            <div className="docs-nav-section-title">Resources</div>
            <ul className="docs-nav-list">
              <li>
                <Link href="/settings" className="docs-nav-item">
                  API Keys & Endpoints
                </Link>
              </li>
              <li>
                <Link href="/architecture" className="docs-nav-item">
                  Vault Explorer
                </Link>
              </li>
              <li>
                <a href="https://github.com/JBPATEL06/kankali-context" target="_blank" rel="noopener noreferrer" className="docs-nav-item">
                  GitHub Repository ↗
                </a>
              </li>
            </ul>
          </div>
        </aside>

        {/* 2. Main Documentation Content */}
        <main className="docs-content-main">
          {/* Header Metadata Tag */}
          <div className="docs-header-tag">
            <span className="docs-version-badge">v2.1.0</span>
            <span className="docs-date-label">Last updated: Aug 2026</span>
          </div>

          {/* TAB 1: GETTING STARTED */}
          {activeTab === "getting-started" && (
            <section>
              <h1 className="docs-title">Getting Started with Kankali</h1>
              <p className="docs-lead">
                Kankali acts as a high-performance, self-custodial transport and persistent memory hub for Model Context Protocol (MCP) clients. It connects Claude, Cursor, ChatGPT, and Grok to your private Google Drive AppData and GitHub context vault.
              </p>

              <h2 className="docs-h2" id="endpoints">Primary Endpoints</h2>
              <p className="docs-paragraph">
                Kankali provides three specialized remote MCP connectors:
              </p>
              
              <div className="card" style={{ padding: "1.25rem", margin: "1rem 0", background: "var(--surface-container-low)" }}>
                <ul style={{ paddingLeft: "1.25rem", margin: 0, lineHeight: 1.8 }}>
                  <li><strong>Master Dual-Cloud Router:</strong> <code>https://kankali-context.vercel.app/mcp/master</code> — Seamlessly searches and syncs across both Google Drive &amp; GitHub.</li>
                  <li><strong>Google Drive AppData Connector:</strong> <code>https://kankali-context.vercel.app/mcp/Drive</code> — Direct access to hidden Google Drive AppData sandbox.</li>
                  <li><strong>GitHub Context Connector:</strong> <code>https://kankali-context.vercel.app/mcp/git</code> — Direct access to your personal GitHub repository vault.</li>
                </ul>
              </div>

              {/* Architectural Note Callout */}
              <div className="docs-callout">
                <div className="docs-callout__icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                </div>
                <div>
                  <h4 className="docs-callout__title">Stateless Zero-Custody Model</h4>
                  <p className="docs-callout__desc">
                    Kankali nodes operate on a 100% stateless proxy model. Your data resides exclusively in your private cloud storage, protected by military-grade AES-256-GCM token encryption and OAuth 2.1 with PKCE verification.
                  </p>
                </div>
              </div>

              <h2 className="docs-h2" id="initialization">Initialization Code Snippet</h2>
              <p className="docs-paragraph">
                To connect custom AI agents or scripts, initialize the Kankali transport client:
              </p>

              <div className="docs-code-container">
                <div className="docs-code-header">
                  <span>TYPESCRIPT SDK INITIALIZATION</span>
                  <button
                    type="button"
                    onClick={() => copyCode(initSdkSnippet, "sdk")}
                    className="btn-terminal-copy"
                  >
                    {copiedKey === "sdk" ? "COPIED ✓" : "COPY CODE"}
                  </button>
                </div>
                <pre className="docs-code-block">{initSdkSnippet}</pre>
              </div>

              <h2 className="docs-h2" id="publishing">Progressive Anchor Chunking</h2>
              <p className="docs-paragraph">
                Rather than loading or overwriting multi-megabyte files, AI assistants read and edit specific document headings (`## heading`), saving up to 90% in token consumption.
              </p>

              <div className="docs-code-container">
                <div className="docs-code-header">
                  <span>PROGRESSIVE CHUNK READ & WRITE</span>
                  <button
                    type="button"
                    onClick={() => copyCode(publishSnippet, "payload")}
                    className="btn-terminal-copy"
                  >
                    {copiedKey === "payload" ? "COPIED ✓" : "COPY CODE"}
                  </button>
                </div>
                <pre className="docs-code-block">{publishSnippet}</pre>
              </div>
            </section>
          )}

          {/* TAB 2: INSTALL AGENT SKILLS */}
          {activeTab === "skills" && (
            <section>
              <h1 className="docs-title">Install Kankali Agent Skill</h1>
              <p className="docs-lead">
                Configure Kankali as a persistent memory server in local coding environments (Claude Desktop, Cursor, Antigravity IDE) or web assistants (Claude.ai, ChatGPT, Grok).
              </p>

              <h2 className="docs-h2">1. Claude Desktop Configuration</h2>
              <p className="docs-paragraph">
                Add Kankali endpoints to your <code>claude_desktop_config.json</code> file located at <code>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows) or <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS):
              </p>

              <div className="docs-code-container">
                <div className="docs-code-header">
                  <span>CLAUDE_DESKTOP_CONFIG.JSON</span>
                  <button
                    type="button"
                    onClick={() => copyCode(claudeDesktopConfig, "claude")}
                    className="btn-terminal-copy"
                  >
                    {copiedKey === "claude" ? "COPIED ✓" : "COPY CONFIG"}
                  </button>
                </div>
                <pre className="docs-code-block">{claudeDesktopConfig}</pre>
              </div>

              <h2 className="docs-h2">2. Universal Remote MCP Connector</h2>
              <p className="docs-paragraph">
                For web clients (Claude.ai, ChatGPT, Grok), add a custom remote MCP connector and paste the Master Connector URL:
              </p>

              <div className="docs-code-container">
                <div className="docs-code-header">
                  <span>MASTER CONNECTOR URL</span>
                  <button
                    type="button"
                    onClick={() => copyCode(masterConnectorUrl, "conn")}
                    className="btn-terminal-copy"
                  >
                    {copiedKey === "conn" ? "COPIED ✓" : "COPY URL"}
                  </button>
                </div>
                <pre className="docs-code-block">{masterConnectorUrl}</pre>
              </div>

              <h2 className="docs-h2">3. Antigravity IDE &amp; Cursor Skill Definition</h2>
              <p className="docs-paragraph">
                For agentic coding IDEs, register Kankali as a persistent memory skill in <code>skills.json</code>:
              </p>

              <div className="docs-code-container">
                <div className="docs-code-header">
                  <span>SKILLS.JSON</span>
                  <button
                    type="button"
                    onClick={() => copyCode(agentSkillConfig, "skill")}
                    className="btn-terminal-copy"
                  >
                    {copiedKey === "skill" ? "COPIED ✓" : "COPY SKILL"}
                  </button>
                </div>
                <pre className="docs-code-block">{agentSkillConfig}</pre>
              </div>
            </section>
          )}

          {/* TAB 3: MCP SPECIFICATION */}
          {activeTab === "spec" && (
            <section>
              <h1 className="docs-title">MCP Protocol Tool Reference</h1>
              <p className="docs-lead">
                Kankali exposes 12 core tools adhering to the Model Context Protocol specification over JSON-RPC 2.0.
              </p>

              <h2 className="docs-h2">1. Core Entry &amp; Inspection Tools</h2>
              <div className="card" style={{ padding: "1.25rem", margin: "1rem 0", background: "var(--surface-container-low)" }}>
                <ul className="feature-checklist" style={{ margin: 0 }}>
                  <li>
                    <span><code>read_notice</code> — Reads top-level user guidance, context boundaries, and session rules (`NOTICE.md`).</span>
                  </li>
                  <li>
                    <span><code>read_index</code> — Returns file tree catalog and document table of contents (`index.md`).</span>
                  </li>
                  <li>
                    <span><code>read_outline</code> — Parses Markdown headings (`#`, `##`, `###`) and returns anchor slugs with line ranges.</span>
                  </li>
                  <li>
                    <span><code>search_files</code> — Performs full-text or heading search across your context vault.</span>
                  </li>
                </ul>
              </div>

              <h2 className="docs-h2">2. Scoped Document Read &amp; Write</h2>
              <div className="card" style={{ padding: "1.25rem", margin: "1rem 0", background: "var(--surface-container-low)" }}>
                <ul className="feature-checklist" style={{ margin: 0 }}>
                  <li>
                    <span><code>read_file(path, section?)</code> — Reads whole document or extracts a single heading section.</span>
                  </li>
                  <li>
                    <span><code>write_file(path, content, section?)</code> — Creates/updates a file or overwrites only a specific heading block.</span>
                  </li>
                  <li>
                    <span><code>delete_path(path, confirmToken?)</code> — Deletes a file or directory with secure HMAC confirmation guard.</span>
                  </li>
                </ul>
              </div>

              <h2 className="docs-h2">3. Project &amp; Session Management</h2>
              <div className="card" style={{ padding: "1.25rem", margin: "1rem 0", background: "var(--surface-container-low)" }}>
                <ul className="feature-checklist" style={{ margin: 0 }}>
                  <li>
                    <span><code>project_upsert</code> / <code>project_get</code> / <code>project_list</code> — Manages structured durable facts for specific projects.</span>
                  </li>
                  <li>
                    <span><code>current_session_set</code> / <code>current_session_get</code> — Stores and retrieves live active conversation context (`session/current.md`).</span>
                  </li>
                </ul>
              </div>
            </section>
          )}

          {/* TAB 4: AUTHENTICATION */}
          {activeTab === "auth" && (
            <section>
              <h1 className="docs-title">Authentication &amp; OAuth 2.1</h1>
              <p className="docs-lead">
                Kankali enforces strict OAuth 2.1 authorization with PKCE (RFC 7636), Dynamic Client Registration (RFC 7591), and Master Zero-Login auth tokens.
              </p>

              <h2 className="docs-h2">Authentication Methods</h2>
              <div className="card" style={{ padding: "1.25rem", margin: "1rem 0", background: "var(--surface-container-low)" }}>
                <ul style={{ paddingLeft: "1.25rem", margin: 0, lineHeight: 1.8 }}>
                  <li><strong>OAuth 2.1 + Google Sign-In:</strong> Standard PKCE authorization flow for remote MCP clients. Unauthenticated requests trigger HTTP 401 WWW-Authenticate headers pointing to client metadata.</li>
                  <li><strong>Bearer MCP API Key (`kk_...`):</strong> Long-lived personal key generated in Vault Settings for local desktop clients.</li>
                  <li><strong>Time-Limited Master Auth Token (`km_...`):</strong> Zero-Login token with customizable expiration (up to 60 days) embedded directly in Master URL query string (`/mcp/master?token=km_...`).</li>
                </ul>
              </div>

              <h2 className="docs-h2">Cryptographic Token Isolation</h2>
              <p className="docs-paragraph">
                OAuth access tokens and API keys are signed with a dedicated high-entropy <code>JWT_SIGNING_SECRET</code>. User Personal Access Tokens (PATs) for GitHub are encrypted using AES-256-GCM before storage.
              </p>
            </section>
          )}

          {/* TAB 5: ARCHITECTURE */}
          {activeTab === "architecture" && (
            <section>
              <h1 className="docs-title">Architecture &amp; Vault Design</h1>
              <p className="docs-lead">
                Zero AI training, zero plaintext token persistence, 100% self-custodial cloud storage.
              </p>

              <div className="card" style={{ padding: "1.5rem", margin: "1.5rem 0" }}>
                <h3 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>Dual-Cloud Storage Infrastructure</h3>
                <p style={{ color: "var(--text-medium)", fontSize: "0.9rem", margin: "0 0 1rem" }}>
                  Kankali bridges hidden Google Drive AppData sandboxes (`spaces=appDataFolder`) and GitHub Git Repositories into a single unified context surface.
                </p>
                <div style={{ marginTop: "1rem" }}>
                  <Link href="/architecture" className="btn-filled" style={{ display: "inline-flex" }}>
                    Explore Live Vault Explorer →
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* Pagination Navigation */}
          <div className="docs-pagination">
            <Link href="/" className="docs-pagination-link">
              ← Protocol Overview
            </Link>
            <Link href="/settings" className="docs-pagination-link">
              Configure Settings &amp; Vault →
            </Link>
          </div>
        </main>

        {/* 3. Right Sidebar Table of Contents */}
        <aside className="docs-sidebar-right">
          <div className="docs-toc-title">On This Page</div>
          <ul className="docs-toc-list">
            <li className="docs-toc-item">
              <a href="#endpoints" className="docs-toc-link docs-toc-link--active">
                Primary Endpoints
              </a>
            </li>
            <li className="docs-toc-item">
              <a href="#initialization" className="docs-toc-link">
                SDK Initialization
              </a>
            </li>
            <li className="docs-toc-item">
              <a href="#publishing" className="docs-toc-link">
                Anchor Chunking
              </a>
            </li>
          </ul>
        </aside>
      </div>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-left">
          <span className="footer-brand-title">KANKALI</span>
          <span>© 2026 Kankali AI Protocol. All rights reserved.</span>
        </div>

        <div className="footer-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/security">Security Compliance</Link>
          <Link href="/status">SLA & Status</Link>
        </div>
      </footer>
    </div>
  );
}
