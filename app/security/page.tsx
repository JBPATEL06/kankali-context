import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ShieldIcon, KeyIcon, CodeIcon, CheckIcon, GithubIcon, GoogleDriveIcon } from "@/components/Icons";

export const metadata = {
  title: "Security Architecture & Cryptographic Audit — Kankali Context",
  description: "Cryptographic specifications and architecture audit of Kankali Context. Learn how AES-256-GCM, HMAC SHA-256, and OAuth 2.1 PKCE protect your AI memory layer.",
};

export default function SecurityPage() {
  return (
    <div className="page-container" style={{ maxWidth: "920px", margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
      <header className="app-navbar" style={{ marginBottom: "2rem" }}>
        <Link href="/" className="nav-brand">
          <BrandLogo size={22} />
          <span>Kankali</span>
        </Link>
        <nav className="nav-links">
          <Link href="/" className="nav-link">Home</Link>
          <Link href="/architecture" className="nav-link">Architecture</Link>
          <Link href="/docs" className="nav-link">Docs</Link>
          <Link href="/status" className="nav-link">Status</Link>
        </nav>
      </header>

      <div className="card" style={{ padding: "2.5rem 2rem", lineHeight: "1.7" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
          <ShieldIcon size={22} color="var(--primary)" />
          <span className="live-pill" style={{ margin: 0 }}>Cryptographic Audit &amp; Architecture</span>
        </div>

        <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0.5rem 0 1rem" }}>Security &amp; Cryptographic Architecture</h1>
        <p style={{ color: "var(--text-medium)", fontSize: "1rem", marginBottom: "2rem" }}>
          This document provides a transparent, verifiable technical audit of the security controls, encryption algorithms, and isolation boundaries implemented in Kankali Context.
        </p>

        <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)", margin: "1.5rem 0" }} />

        {/* Section 1: Self-Custodial Architecture */}
        <h2 style={{ fontSize: "1.35rem", fontWeight: 600, marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          1. Stateless Zero-Custody Proxy Model
        </h2>
        <p>
          Unlike conventional AI memory SaaS solutions that store user data on central databases, Kankali is designed as a <strong>stateless cryptographic transport layer</strong>:
        </p>

        <div style={{ background: "var(--surface-container)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "1.25rem", margin: "1rem 0", fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
          <div style={{ color: "var(--primary)", fontWeight: 600, marginBottom: "0.5rem" }}>DATA FLOW &amp; ISOLATION MAP:</div>
          <div>[ Claude / Cursor / ChatGPT / Grok ]</div>
          <div style={{ color: "var(--text-muted)" }}>       │ (HTTPS / MCP JSON-RPC with HMAC Token)</div>
          <div style={{ color: "var(--text-muted)" }}>       ▼</div>
          <div>[ Kankali Stateless Edge Proxy (Vercel Serverless) ] ── (In-Memory Processing Only)</div>
          <div style={{ color: "var(--text-muted)" }}>       ├──► [ Google Drive: spaces=appDataFolder ] (User's Private Account)</div>
          <div style={{ color: "var(--text-muted)" }}>       └──► [ GitHub Repository Vault ] (User's Private Repo)</div>
        </div>

        <ul style={{ paddingLeft: "1.5rem" }}>
          <li><strong>0 Central File Storage</strong>: Markdown context files, SDLC documents, and project memories are written directly to your private Google Drive or GitHub repo.</li>
          <li><strong>0 Disk Persistence on Server</strong>: Vercel serverless functions process payloads in memory and terminate immediately after forwarding requests.</li>
        </ul>

        {/* Section 2: Cryptographic Standards */}
        <h2 style={{ fontSize: "1.35rem", fontWeight: 600, marginTop: "2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          2. Cryptographic Standards &amp; Implementation
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem", margin: "1rem 0" }}>
          <div className="card" style={{ padding: "1.25rem", background: "var(--surface-container-low)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, color: "var(--primary)", marginBottom: "0.4rem" }}>
              <KeyIcon size={16} /> AES-256-GCM
            </div>
            <p style={{ fontSize: "0.825rem", color: "var(--text-medium)", margin: 0 }}>
              All stored credentials (such as GitHub PAT tokens) are encrypted with AES-256 in Galois/Counter Mode (GCM) using 96-bit random IVs and 128-bit authentication tags to prevent ciphertext tampering.
            </p>
          </div>

          <div className="card" style={{ padding: "1.25rem", background: "var(--surface-container-low)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, color: "var(--tertiary)", marginBottom: "0.4rem" }}>
              <ShieldIcon size={16} /> HMAC SHA-256
            </div>
            <p style={{ fontSize: "0.825rem", color: "var(--text-medium)", margin: 0 }}>
              Master Auth Tokens (<code>km_&lt;expiresAt&gt;...</code>) and Two-Step Delete Confirmation tokens are cryptographically signed with HMAC SHA-256 with strictly enforced expiration timestamps.
            </p>
          </div>

          <div className="card" style={{ padding: "1.25rem", background: "var(--surface-container-low)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, color: "var(--color-cyan)", marginBottom: "0.4rem" }}>
              <CodeIcon size={16} /> OAuth 2.1 + PKCE
            </div>
            <p style={{ fontSize: "0.825rem", color: "var(--text-medium)", margin: 0 }}>
              Implements Proof Key for Code Exchange (RFC 7636) with SHA-256 code challenge verification on dynamic client registrations and MCP endpoint authentication.
            </p>
          </div>
        </div>

        {/* Section 3: Google Drive & GitHub Permissions */}
        <h2 style={{ fontSize: "1.35rem", fontWeight: 600, marginTop: "2rem" }}>3. Minimal Scoped Permissions</h2>
        <ul style={{ paddingLeft: "1.5rem" }}>
          <li>
            <strong>Google Drive Scope</strong>: We request <strong>ONLY</strong> <code>https://www.googleapis.com/auth/drive.appdata</code>. This restricted scope allows Kankali to create and read files <em>only</em> inside a private hidden app directory. Kankali has <strong>ZERO access</strong> to your personal Google Drive files, Google Docs, or photos.
          </li>
          <li>
            <strong>GitHub Token Scope</strong>: We require only <code>repo</code> permissions on the specific repository you designate as your vault.
          </li>
        </ul>

        {/* Section 4: Public Audit & Source Code */}
        <h2 style={{ fontSize: "1.35rem", fontWeight: 600, marginTop: "2rem" }}>4. Verify the Source Code</h2>
        <p>
          Security by obscurity is not security. Every algorithm, token verifier, and router is open source and available for independent security review:
        </p>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", margin: "1rem 0" }}>
          <a
            href="https://github.com/JBPATEL06/kankali-context/blob/main/lib/crypto.ts"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-tonal"
            style={{ fontSize: "0.825rem", padding: "0.4rem 0.8rem", textDecoration: "none" }}
          >
            Inspect lib/crypto.ts (AES-256-GCM) ↗
          </a>
          <a
            href="https://github.com/JBPATEL06/kankali-context/blob/main/lib/master-token.ts"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-tonal"
            style={{ fontSize: "0.825rem", padding: "0.4rem 0.8rem", textDecoration: "none" }}
          >
            Inspect lib/master-token.ts (HMAC Verification) ↗
          </a>
          <a
            href="https://github.com/JBPATEL06/kankali-context"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-filled"
            style={{ fontSize: "0.825rem", padding: "0.4rem 0.8rem", textDecoration: "none" }}
          >
            <GithubIcon size={14} /> Full Public Repository
          </a>
        </div>

        <div style={{ marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between" }}>
          <Link href="/" style={{ color: "var(--primary)", fontSize: "0.9rem", fontWeight: 600 }}>← Back to Home</Link>
          <Link href="/status" style={{ color: "var(--primary)", fontSize: "0.9rem", fontWeight: 600 }}>Live Service Status →</Link>
        </div>
      </div>
    </div>
  );
}
