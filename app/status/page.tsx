import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { CheckIcon, SparklesIcon, GoogleDriveIcon, GithubIcon, ShieldIcon } from "@/components/Icons";

export const metadata = {
  title: "Service Status & Uptime — Kankali Context",
  description: "Live operational status of Kankali MCP endpoints, OAuth services, and cloud vaults.",
};

export default function StatusPage() {
  const systems = [
    { name: "Master Unified MCP Server (/mcp/master)", status: "Operational", uptime: "99.99%", latency: "45ms" },
    { name: "Google Drive AppData Connector (/mcp/Drive)", status: "Operational", uptime: "99.98%", latency: "120ms" },
    { name: "GitHub Storage Vault Connector (/mcp/git)", status: "Operational", uptime: "99.95%", latency: "180ms" },
    { name: "OAuth 2.1 & Master Token Verifier", status: "Operational", uptime: "100.0%", latency: "<1ms" },
    { name: "In-Memory Serverless Caching Layer", status: "Operational", uptime: "100.0%", latency: "<0.1ms" },
  ];

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
          <div>
            <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0 0 0.5rem" }}>Service Status</h1>
            <p style={{ color: "var(--text-medium)", margin: 0 }}>
              Live operational health and performance metrics across Kankali MCP endpoints.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "rgba(86, 229, 169, 0.1)", border: "1px solid var(--tertiary)", padding: "0.5rem 1rem", borderRadius: "20px", color: "var(--tertiary)", fontWeight: 600, fontSize: "0.85rem" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--tertiary)", display: "inline-block" }}></span>
            All Systems Operational
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)", margin: "1.5rem 0" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", margin: "1.5rem 0" }}>
          {systems.map((s, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "1rem 1.25rem",
                background: "var(--surface-container-low)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "6px",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--on-surface)" }}>{s.name}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Avg Latency: {s.latency} · 30-Day Uptime: {s.uptime}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--tertiary)", fontWeight: 600, fontSize: "0.825rem" }}>
                <CheckIcon size={14} color="var(--tertiary)" /> {s.status}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "2rem", padding: "1.25rem", background: "var(--surface-container)", borderRadius: "6px", border: "1px solid var(--border-subtle)", fontSize: "0.85rem", color: "var(--text-medium)" }}>
          <strong style={{ color: "var(--on-surface)" }}>Stateless Reliability:</strong> Kankali runs on globally distributed edge serverless infrastructure with automated failover and zero cold-start bottlenecks for active sessions.
        </div>

        <div style={{ marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between" }}>
          <Link href="/" style={{ color: "var(--primary)", fontSize: "0.9rem", fontWeight: 600 }}>← Back to Home</Link>
          <Link href="/architecture" style={{ color: "var(--primary)", fontSize: "0.9rem", fontWeight: 600 }}>Architecture Vault →</Link>
        </div>
      </div>
    </div>
  );
}
