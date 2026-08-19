"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<"getting-started" | "skills" | "spec" | "auth" | "architecture">("getting-started");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copyCode(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const connectorUrl = "https://kankali-context.vercel.app/mcp/git";

  const claudeDesktopConfig = `{
  "mcpServers": {
    "kankali": {
      "url": "https://kankali-context.vercel.app/mcp/git",
      "headers": {
        "Authorization": "Bearer <YOUR_KANKALI_MCP_API_KEY>"
      }
    }
  }
}`;

  const agentSkillConfig = `{
  "name": "kankali-context-sync",
  "description": "Automatic personal memory and context synchronization for AI assistants via Kankali MCP",
  "mcpServer": {
    "url": "https://kankali-context.vercel.app/mcp/git",
    "auth": "bearer",
    "scopes": ["mcp:tools"]
  },
  "tools": [
    "read_notice",
    "read_index",
    "project_init",
    "project_read",
    "project_write",
    "session_context_sync"
  ]
}`;

  const initSdkSnippet = `import { KankaliClient } from '@kankali/sdk';

// Initialize the transport client
const client = new KankaliClient({
  apiKey: process.env.KANKALI_API_KEY,
  ingressUrl: 'https://kankali-context.vercel.app/mcp/git',
  tls: {
    rejectUnauthorized: true
  }
});

await client.connect();
console.log('Transport layer established:', client.sessionId);`;

  const publishSnippet = `const contextPayload = {
  domain: 'project-architecture',
  timestamp: new Date().toISOString(),
  sessionSummary: 'Security hardening & token isolation verification',
  activeContext: {
    keyDecisions: ['AES-256-GCM PAT Encryption', 'Strict JWT key separation'],
    status: 'OPTIMAL'
  }
};

// Publish asynchronously to your private GitHub repo
const receipt = await client.syncContext({
  repo: 'kankali-ai-memory',
  branch: 'main',
  payload: contextPayload
});

console.log('Context synchronized. Commit SHA:', receipt.sha);`;

  return (
    <div>
      {/* Top Navigation Bar */}
      <header className="app-navbar">
        <Link href="/" className="nav-brand">
          <BrandLogo size={22} />
          <span>Kankali</span>
        </Link>

        <nav className="nav-links">
          <Link href="/" className="nav-link">
            Protocol
          </Link>
          <Link href="/architecture" className="nav-link">
            Architecture
          </Link>
          <Link href="/settings" className="nav-link">
            Settings
          </Link>
          <Link href="/docs" className="nav-link nav-link--active">
            Documentation
          </Link>
        </nav>

        <div className="nav-actions">
          <Link href="/settings" className="btn-launch">
            Launch App
          </Link>
        </div>
      </header>

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
                  Getting Started
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
                  MCP Specification
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveTab("auth")}
                  className={`docs-nav-item ${activeTab === "auth" ? "docs-nav-item--active" : ""}`}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                >
                  Authentication & OAuth 2.1
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveTab("architecture")}
                  className={`docs-nav-item ${activeTab === "architecture" ? "docs-nav-item--active" : ""}`}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                >
                  Architecture & Vault
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
                <Link href="/#protocol" className="docs-nav-item">
                  Universal Connector
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
            <span className="docs-date-label">Last updated: Oct 2026</span>
          </div>

          {/* TAB 1: GETTING STARTED */}
          {activeTab === "getting-started" && (
            <section>
              <h1 className="docs-title">Getting Started with Kankali</h1>
              <p className="docs-lead">
                Kankali acts as a high-performance, secure transport and memory layer for Model Context Protocol (MCP) communications. This guide covers the fundamental concepts of connecting AI assistants, initializing the endpoint, and routing payloads.
              </p>

              <h2 className="docs-h2" id="transport-concept">The Transport Layer Concept</h2>
              <p className="docs-paragraph">
                At its core, Kankali decouples personal context formulation from local device locks. When you integrate Kankali, you are not writing business logic into a single proprietary assistant; instead, you are utilizing an optimized, encrypted pipe designed specifically for low-latency AI context persistence and state synchronization.
              </p>

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
                  <h4 className="docs-callout__title">Architectural Note</h4>
                  <p className="docs-callout__desc">
                    Kankali nodes operate on a stateless proxy model. Your data vault resides exclusively in your private GitHub repository, protected by military-grade AES-256-GCM token encryption and OAuth 2.1 with PKCE verification.
                  </p>
                </div>
              </div>

              <h2 className="docs-h2" id="initialization">Initialization</h2>
              <p className="docs-paragraph">
                To begin routing through Kankali, connect your AI client with your endpoint and Bearer key or universal OAuth connector. We recommend using the remote connector endpoint:
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

              <h2 className="docs-h2" id="publishing">Publishing & Synchronizing Context</h2>
              <p className="docs-paragraph">
                Once connected, publishing context updates allows all attached assistants (Claude, ChatGPT, Grok, Cursor) to instantly read the unified project memory.
              </p>

              <div className="docs-code-container">
                <div className="docs-code-header">
                  <span>CONTEXT SYNC PAYLOAD</span>
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
              <h1 className="docs-title">Install Kankali MCP Skill</h1>
              <p className="docs-lead">
                Install Kankali as an automated Agent Skill or MCP server in your local coding agent (Claude Desktop, Cursor, Antigravity IDE, Windsurf).
              </p>

              <h2 className="docs-h2">1. Claude Desktop Setup</h2>
              <p className="docs-paragraph">
                Add Kankali to your <code>claude_desktop_config.json</code> file located at <code>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows) or <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS):
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

              <h2 className="docs-h2">2. Universal Remote MCP Connector (Claude.ai / ChatGPT / Grok)</h2>
              <p className="docs-paragraph">
                For web clients, simply add a custom remote MCP connector and paste your URL:
              </p>

              <div className="docs-code-container">
                <div className="docs-code-header">
                  <span>CONNECTOR URL</span>
                  <button
                    type="button"
                    onClick={() => copyCode(connectorUrl, "conn")}
                    className="btn-terminal-copy"
                  >
                    {copiedKey === "conn" ? "COPIED ✓" : "COPY URL"}
                  </button>
                </div>
                <pre className="docs-code-block">{connectorUrl}</pre>
              </div>

              <h2 className="docs-h2">3. Agent Skill Definition (skills.json)</h2>
              <p className="docs-paragraph">
                For Antigravity, Cursor, and custom agentic frameworks, register Kankali as a persistent memory skill:
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
              <h1 className="docs-title">MCP Protocol Specification</h1>
              <p className="docs-lead">
                Kankali implements the official Model Context Protocol (MCP 2.0) with JSON-RPC 2.0 streaming transports over SSE and HTTPS POST.
              </p>

              <h2 className="docs-h2">Standard Tool Definitions</h2>
              <ul className="feature-checklist" style={{ marginTop: "1rem" }}>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  <span><code>read_notice</code> — Reads top-level user guidance and context boundaries.</span>
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  <span><code>read_index</code> — Returns the table of contents and file map for your context repository.</span>
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  <span><code>project_read</code> / <code>project_write</code> — Structured read/write access to project domain documentation.</span>
                </li>
              </ul>
            </section>
          )}

          {/* TAB 4: AUTHENTICATION */}
          {activeTab === "auth" && (
            <section>
              <h1 className="docs-title">Authentication & OAuth 2.1</h1>
              <p className="docs-lead">
                Kankali supports standard OAuth 2.1 authorization code flow with PKCE (RFC 7636) and Dynamic Client Registration (RFC 7591).
              </p>

              <h2 className="docs-h2">Security Boundaries</h2>
              <p className="docs-paragraph">
                Each user possesses an isolated context tenant. OAuth access tokens are signed with a dedicated high-entropy <code>JWT_SIGNING_SECRET</code> and enforce strict cryptographic isolation from storage encryption keys.
              </p>
            </section>
          )}

          {/* TAB 5: ARCHITECTURE */}
          {activeTab === "architecture" && (
            <section>
              <h1 className="docs-title">Architecture & Vault Design</h1>
              <p className="docs-lead">
                Zero AI training, zero plaintext token persistence. Your memory repository belongs 100% to you.
              </p>

              <div style={{ marginTop: "1.5rem" }}>
                <Link href="/settings" className="btn-filled">
                  Open Settings & Context Vault →
                </Link>
              </div>
            </section>
          )}

          {/* Pagination Navigation */}
          <div className="docs-pagination">
            <Link href="/" className="docs-pagination-link">
              ← Protocol Overview
            </Link>
            <Link href="/settings" className="docs-pagination-link">
              Configure Settings & Vault →
            </Link>
          </div>
        </main>

        {/* 3. Right Sidebar Table of Contents */}
        <aside className="docs-sidebar-right">
          <div className="docs-toc-title">On This Page</div>
          <ul className="docs-toc-list">
            <li className="docs-toc-item">
              <a href="#transport-concept" className="docs-toc-link docs-toc-link--active">
                Getting Started
              </a>
            </li>
            <li className="docs-toc-item">
              <a href="#transport-concept" className="docs-toc-link">
                Transport Concept
              </a>
            </li>
            <li className="docs-toc-item">
              <a href="#initialization" className="docs-toc-link">
                Initialization
              </a>
            </li>
            <li className="docs-toc-item">
              <a href="#publishing" className="docs-toc-link">
                Publishing Data
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
          <Link href="#privacy">Privacy Policy</Link>
          <Link href="#terms">Terms of Service</Link>
          <Link href="#security">Security Compliance</Link>
          <Link href="#sla">SLA</Link>
        </div>
      </footer>
    </div>
  );
}
