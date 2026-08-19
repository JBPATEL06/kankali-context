"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { AuthModal } from "@/components/AuthModal";
import { VaultExplorer } from "@/components/VaultExplorer";
import {
  FolderIcon,
  FileTextIcon,
  ShieldIcon,
} from "@/components/Icons";

type Me = {
  email: string;
  name?: string;
  mcpApiKey?: string;
  hasGithubToken: boolean;
  hasGoogleDrive: boolean;
};

export default function ArchitecturePage() {
  const { status } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/user/me");
      if (res.ok) {
        const data = await res.json();
        setMe(data);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status]);

  if (status === "loading") {
    return (
      <main className="page-container" style={{ textAlign: "center", paddingTop: "5rem" }}>
        <div className="live-pill">
          <span className="live-pill__dot"></span> Loading Kankali Architecture…
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div>
        <header className="app-navbar">
          <Link href="/" className="nav-brand">
            <BrandLogo size={22} />
            <span>Kankali</span>
          </Link>
          <nav className="nav-links">
            <Link href="/" className="nav-link">
              Protocol
            </Link>
            <Link href="/architecture" className="nav-link nav-link--active">
              Architecture
            </Link>
            <Link href="/docs" className="nav-link">
              Documentation
            </Link>
          </nav>
        </header>

        <main className="page-container" style={{ maxWidth: "28rem", paddingTop: "4rem" }}>
          <div className="card card--login" style={{ textAlign: "center" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <h1 style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 0.35rem", color: "#ffffff" }}>
                Sign In to Vault
              </h1>
              <p style={{ color: "var(--on-surface-variant)", fontSize: "13px", margin: 0 }}>
                Sign in with Google or email to explore your private AI context vault.
              </p>
            </div>

            <button
              type="button"
              onClick={() => signIn("google")}
              className="btn-hero-google"
              style={{ width: "100%", justifyContent: "center", marginBottom: "1.25rem" }}
            >
              Sign In with Google
            </button>

            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="btn-filled"
              style={{ width: "100%" }}
            >
              Sign In / Sign Up with Email
            </button>
          </div>
        </main>

        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialMode="signin"
        />
      </div>
    );
  }

  return (
    <div>
      {/* Top Navbar */}
      <header className="app-navbar">
        <Link href="/" className="nav-brand">
          <BrandLogo size={22} />
          <span>Kankali</span>
        </Link>

        <nav className="nav-links">
          <Link href="/" className="nav-link">
            Protocol
          </Link>
          <Link href="/architecture" className="nav-link nav-link--active">
            Architecture
          </Link>
          <Link href="/settings" className="nav-link">
            Settings
          </Link>
          <Link href="/docs" className="nav-link">
            Documentation
          </Link>
        </nav>

        <div className="nav-actions">
          <button type="button" onClick={() => signOut()} className="nav-signin-link" style={{ opacity: 0.7 }}>
            Sign Out
          </button>
        </div>
      </header>

      <main className="page-container" style={{ maxWidth: "96rem", paddingLeft: "1.5rem", paddingRight: "1.5rem" }}>
        {/* Title Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <h1 style={{ fontSize: "1.85rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                Architecture &amp; Context Vault
              </h1>
              <span className="badge-tag badge-tag--mint">EXPLORER</span>
            </div>
            <p style={{ fontSize: "0.88rem", color: "var(--text-medium)", margin: 0 }}>
              Live hierarchical tree view of your SDLC documents, session state, and codebase technical references.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link href="/settings" className="btn-tonal" style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <ShieldIcon size={14} /> Master MCP &amp; Settings
            </Link>
            <Link href="/docs" className="btn-tonal" style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <FileTextIcon size={14} /> Docs
            </Link>
          </div>
        </div>

        {/* Live File Explorer */}
        <VaultExplorer
          hasGoogleDrive={Boolean(me?.hasGoogleDrive)}
          hasGithubToken={Boolean(me?.hasGithubToken)}
          onLinkDrive={() => signIn("google")}
        />

        {/* SDLC Architecture Reference Card */}
        <section className="card" style={{ marginTop: "2rem", padding: "1.5rem" }}>
          <h2 className="card__title" style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
            SDLC Layout Reference
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-medium)", marginBottom: "1rem" }}>
            Standard folder structure maintained automatically by Kankali MCP connectors:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "1rem", borderRadius: "6px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--primary)", marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <FolderIcon size={15} color="var(--primary)" /> project/&lt;slug&gt;/
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.8rem", color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
                <li><code>status.md</code> — Snapshot state &amp; stack</li>
                <li><code>docs/overview.md</code> — Product vision &amp; scope</li>
                <li><code>docs/plan.md</code> — Roadmap &amp; milestones</li>
                <li><code>docs/audit.md</code> — Security &amp; quality audits</li>
                <li><code>codebase/</code> — Technical reference notes</li>
                <li><code>resources/</code> — Attached links &amp; API specs</li>
              </ul>
            </div>

            <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "1rem", borderRadius: "6px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--tertiary)", marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <FolderIcon size={15} color="var(--tertiary)" /> issues/ &amp; session/
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.8rem", color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
                <li><code>issues/&lt;slug&gt;/current.md</code> — Active bug/task pointer</li>
                <li><code>issues/&lt;slug&gt;/&lt;task&gt;.md</code> — Individual tracked issue</li>
                <li><code>session/current.md</code> — Curated live conversation state</li>
                <li><code>NOTICE.md</code> — Mandatory agent instruction protocol</li>
                <li><code>index.md</code> — Catalog map of all paths</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
