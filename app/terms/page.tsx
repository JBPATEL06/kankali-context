import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { FileTextIcon } from "@/components/Icons";

export const metadata = {
  title: "Terms of Service — Kankali Context",
  description: "Terms of service and open-source usage terms for Kankali Context MCP platform.",
};

export default function TermsPage() {
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
          <FileTextIcon size={20} color="var(--primary)" />
          <span className="live-pill" style={{ margin: 0 }}>Effective Date: August 19, 2026</span>
        </div>

        <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0.5rem 0 1rem" }}>Terms of Service</h1>
        <p style={{ color: "var(--text-medium)", fontSize: "1rem", marginBottom: "2rem" }}>
          Please read these terms carefully before utilizing Kankali Context (hosted or self-hosted).
        </p>

        <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)", margin: "1.5rem 0" }} />

        <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginTop: "1.5rem" }}>1. Open Source MIT License</h2>
        <p>
          The Kankali Context codebase is licensed under the <strong>MIT Open Source License</strong>. You are free to inspect, modify, fork, and self-host this software for personal or commercial projects.
        </p>

        <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginTop: "1.5rem" }}>2. Responsible Usage &amp; API Limits</h2>
        <p>
          When using the free hosted deployment on Vercel:
        </p>
        <ul style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
          <li>You agree not to abuse, DDoS, or bypass authentication protections on MCP endpoints.</li>
          <li>Storage and request quotas are subject to Google Drive API, GitHub REST API, and Vercel serverless quotas.</li>
          <li>For high-volume enterprise automation (millions of calls/day), we recommend self-hosting on your own VPS or Oracle Cloud Free VM.</li>
        </ul>

        <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginTop: "1.5rem" }}>3. Data Custody &amp; Disclaimers</h2>
        <p>
          Because Kankali Context is a self-custodial transport proxy that writes directly to your own storage accounts, you are responsible for maintaining backups and managing permissions of your GitHub repositories and Google accounts.
        </p>

        <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginTop: "1.5rem" }}>4. Modifications to Service</h2>
        <p>
          We continuously update and improve the MCP protocol standards. Updates to endpoints and tools will maintain backward compatibility whenever technically feasible.
        </p>

        <div style={{ marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between" }}>
          <Link href="/" style={{ color: "var(--primary)", fontSize: "0.9rem", fontWeight: 600 }}>← Back to Home</Link>
          <Link href="/privacy" style={{ color: "var(--primary)", fontSize: "0.9rem", fontWeight: 600 }}>Privacy Policy →</Link>
        </div>
      </div>
    </div>
  );
}
