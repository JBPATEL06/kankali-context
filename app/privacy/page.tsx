import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ShieldIcon, KeyIcon, GithubIcon, GoogleDriveIcon } from "@/components/Icons";

export const metadata = {
  title: "Privacy Policy — Kankali Context",
  description: "Transparent privacy policy for Kankali Context. Learn how your data is stored in your own Google Drive & GitHub with zero central retention and zero AI training.",
};

export default function PrivacyPage() {
  return (
    <div className="page-container" style={{ maxWidth: "860px", margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
      <header className="app-navbar" style={{ marginBottom: "2rem" }}>
        <Link href="/" className="nav-brand">
          <BrandLogo size={22} />
          <span>Kankali</span>
        </Link>
        <nav className="nav-links">
          <Link href="/" className="nav-link">Home</Link>
          <Link href="/architecture" className="nav-link">Architecture</Link>
          <Link href="/security" className="nav-link">Security</Link>
          <Link href="/docs" className="nav-link">Docs</Link>
        </nav>
      </header>

      <div className="card" style={{ padding: "2.5rem 2rem", lineHeight: "1.7" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
          <ShieldIcon size={20} color="var(--primary)" />
          <span className="live-pill" style={{ margin: 0 }}>Last Updated: August 19, 2026</span>
        </div>

        <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0.5rem 0 1rem" }}>Privacy Policy</h1>
        <p style={{ color: "var(--text-medium)", fontSize: "1rem", marginBottom: "2rem" }}>
          At Kankali Context, we believe user privacy is an architectural requirement, not an afterthought. This policy explains our <strong>Self-Custodial &amp; Zero-Retention Data Architecture</strong>.
        </p>

        <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)", margin: "1.5rem 0" }} />

        <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginTop: "1.5rem" }}>1. Self-Custody Core Principle (Where Your Data Lives)</h2>
        <p>
          Unlike proprietary SaaS platforms that store your AI conversations and codebase notes in centralized databases, Kankali operates on a <strong>Self-Custodial model</strong>:
        </p>
        <ul style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
          <li><strong>Google Drive App Data</strong>: Context files are stored in your own Google account inside a private, hidden sandbox folder (<code>spaces=appDataFolder</code>) accessible only by you.</li>
          <li><strong>GitHub Repository Vault</strong>: Context files are committed directly to your own private GitHub repository (e.g. <code>username/context-vault</code>).</li>
          <li><strong>Zero Central Storage</strong>: Kankali servers do <strong>NOT</strong> host, copy, or maintain copies of your context documents, project files, or notes.</li>
        </ul>

        <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginTop: "1.5rem" }}>2. Zero AI Training Guarantee</h2>
        <p>
          We never use, sell, or process any context, code, memories, or prompts passing through the MCP transport layer to train AI models. All MCP requests are processed in-memory as stateless proxies directly communicating with Google Drive or GitHub APIs.
        </p>

        <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginTop: "1.5rem" }}>3. Data Collected &amp; Encryption Standards</h2>
        <p>
          To facilitate authentication and API routing, we collect only minimal metadata:
        </p>
        <ul style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
          <li><strong>Account Identity</strong>: User email address and OAuth UID provided during Google Sign-in.</li>
          <li><strong>OAuth Access &amp; Refresh Tokens</strong>: Scoped strictly to <code>https://www.googleapis.com/auth/drive.appdata</code> (hidden AppData only; cannot read your personal Google Drive files).</li>
          <li><strong>GitHub Personal Access Tokens (PAT)</strong>: If connected, GitHub tokens are encrypted with <strong>AES-256-GCM</strong> using dedicated server encryption keys before storage.</li>
        </ul>

        <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginTop: "1.5rem" }}>4. Third-Party Access &amp; MCP Flow</h2>
        <p>
          When you connect your Claude, Cursor, ChatGPT, or Grok assistant via our Model Context Protocol (MCP) endpoints (<code>/mcp/master</code>, <code>/mcp/Drive</code>, <code>/mcp/git</code>), requests are authenticated via signed time-limited Master Tokens (<code>km_...</code>) or OAuth 2.1 PKCE. Data flows directly between your AI client and your designated storage vault.
        </p>

        <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginTop: "1.5rem" }}>5. Open Source &amp; Independent Verification</h2>
        <p>
          Kankali Context is 100% open source under the MIT License. You can inspect every line of code, verify token handling, or self-host your own instance on Oracle Cloud, VPS, or Vercel:
        </p>
        <p>
          <a href="https://github.com/JBPATEL06/kankali-context" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", fontWeight: 600 }}>
            Inspect Public GitHub Repository (JBPATEL06/kankali-context) →
          </a>
        </p>

        <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginTop: "1.5rem" }}>6. Account Deletion &amp; Right to Erasure</h2>
        <p>
          You can revoke OAuth permissions at any time from your Google Account or GitHub Settings. Because files live in your own Drive/Repo, you retain complete physical control to delete your context files at any time.
        </p>

        <div style={{ marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between" }}>
          <Link href="/" style={{ color: "var(--primary)", fontSize: "0.9rem", fontWeight: 600 }}>← Back to Home</Link>
          <Link href="/security" style={{ color: "var(--primary)", fontSize: "0.9rem", fontWeight: 600 }}>Security Architecture &amp; Audit →</Link>
        </div>
      </div>
    </div>
  );
}
