"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { AuthModal } from "@/components/AuthModal";
import {
  ShieldIcon,
  KeyIcon,
  GithubIcon,
  GoogleDriveIcon,
  CheckIcon,
  CopyIcon,
  SparklesIcon,
  CodeIcon,
  ClockIcon,
} from "@/components/Icons";

export default function Home() {
  const { data: session, status } = useSession();
  const [copied, setCopied] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");

  const connectorUrl = "https://kankali-context.vercel.app/mcp/master";

  function handleCopy() {
    navigator.clipboard.writeText(connectorUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  function openAuth(mode: "signin" | "signup") {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }

  return (
    <div>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
      />

      {/* Top Navigation Bar */}
      <header className="app-navbar">
        <Link href="/" className="nav-brand">
          <BrandLogo size={22} />
          <span>Kankali Context</span>
        </Link>

        <nav className="nav-links">
          <Link href="/" className="nav-link nav-link--active">
            Protocol
          </Link>
          <Link href="/architecture" className="nav-link">
            Architecture
          </Link>
          <Link href="/security" className="nav-link">
            Security &amp; Audit
          </Link>
          <Link href="/docs" className="nav-link">
            Docs
          </Link>
          <Link href="/status" className="nav-link">
            Status
          </Link>
        </nav>

        <div className="nav-actions">
          <a
            href="https://github.com/JBPATEL06/kankali-context"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-tonal"
            style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", padding: "0.35rem 0.65rem", textDecoration: "none" }}
          >
            <GithubIcon size={14} /> Open Source
          </a>

          {status === "unauthenticated" && (
            <>
              <button
                type="button"
                onClick={() => openAuth("signin")}
                className="nav-signin-link"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => openAuth("signup")}
                className="btn-launch"
              >
                Launch App
              </button>
            </>
          )}

          {status === "authenticated" && (
            <>
              <Link href="/settings" className="nav-signin-link">
                Dashboard ({session?.user?.email?.split("@")[0]})
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="nav-signin-link"
                style={{ opacity: 0.7 }}
              >
                Sign Out
              </button>
              <Link href="/settings" className="btn-launch">
                Vault Settings
              </Link>
            </>
          )}

          {status === "loading" && (
            <span className="live-pill" style={{ margin: 0, padding: "0.25rem 0.65rem" }}>
              <span className="live-pill__dot"></span> Loading…
            </span>
          )}
        </div>
      </header>

      <main className="page-container">
        {/* Hero Section */}
        <section className="hero-section">
          <div>
            <div className="live-pill">
              <span className="live-pill__dot"></span>
              100% Open Source · Self-Custodial AI Context Protocol
            </div>
          </div>

          <h1 className="hero-headline">
            One Persistent Memory.<br />
            Every AI Assistant.
          </h1>

          <p className="hero-subtitle">
            Eliminate context fragmentation across Claude, Cursor, ChatGPT, and Grok. Kankali provides a transparent, stateless memory layer that stores project architecture, memory chunks, and SDLC docs directly in your <strong>private Google Drive AppData</strong> and <strong>GitHub Repository</strong>.
          </p>

          <div className="hero-cta-row">
            {status === "authenticated" ? (
              <Link href="/settings" className="btn-hero-google">
                <SparklesIcon size={15} color="currentColor" />
                Go to Settings &amp; Vault
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openAuth("signin")}
                className="btn-hero-google"
              >
                <SparklesIcon size={15} color="currentColor" />
                Get Started / Connect Vault
              </button>
            )}

            <Link href="/architecture" className="btn-hero-doc">
              Explore Vault UI
            </Link>

            <a
              href="https://github.com/JBPATEL06/kankali-context"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-hero-doc"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <GithubIcon size={15} /> Source Code
            </a>
          </div>
        </section>

        {/* Horizontal Badges Divider Section */}
        <section className="divider-badges-bar">
          <div className="divider-badge-item">
            <ShieldIcon size={16} color="var(--primary)" />
            <span>AES-256-GCM ENCRYPTED</span>
          </div>

          <div className="divider-badge-item">
            <KeyIcon size={16} color="var(--tertiary)" />
            <span>OAUTH 2.1 + PKCE (RFC 7636)</span>
          </div>

          <div className="divider-badge-item">
            <GoogleDriveIcon size={16} />
            <span>GOOGLE DRIVE APPDATA SANDBOX</span>
          </div>

          <div className="divider-badge-item">
            <GithubIcon size={16} />
            <span>100% OWNED IN YOUR GITHUB</span>
          </div>
        </section>

        {/* Remote MCP Endpoint 2-Column Section */}
        <section id="protocol" className="endpoint-section">
          <div className="endpoint-info">
            <h2>Unified Master MCP Endpoint</h2>
            <p>
              Connect Claude, Cursor, ChatGPT, or Grok to your persistent memory vault in seconds with zero login friction using signed Master Auth URLs.
            </p>

            <ul className="feature-checklist">
              <li>
                <CheckIcon size={16} color="var(--tertiary)" />
                <span><strong>Self-Custodial</strong>: Memory files live in your private Drive or GitHub, never on central disks.</span>
              </li>
              <li>
                <CheckIcon size={16} color="var(--tertiary)" />
                <span><strong>Anchor Chunking</strong>: Saves 95% tokens by reading specific heading blocks (<code>read_outline</code>).</span>
              </li>
              <li>
                <CheckIcon size={16} color="var(--tertiary)" />
                <span><strong>Stateless &amp; Auditable</strong>: 100% open source under MIT License. No AI model training on your data.</span>
              </li>
            </ul>
          </div>

          <div className="terminal-card">
            <div className="terminal-card__header">
              <span>MASTER MCP CONNECTOR URL</span>
              <span className="terminal-card__active-badge">
                <span className="terminal-card__active-dot"></span>
                ACTIVE (V2.0)
              </span>
            </div>

            <div className="terminal-code-box">
              <code>{connectorUrl}</code>
              <button
                type="button"
                onClick={handleCopy}
                className="btn-terminal-copy"
                title="Copy endpoint URL"
              >
                {copied ? (
                  <span style={{ color: "var(--color-mint)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    COPIED ✓
                  </span>
                ) : (
                  <CopyIcon size={16} />
                )}
              </button>
            </div>

            <div className="terminal-card__footer">
              <ShieldIcon size={13} color="var(--text-muted)" />
              <span>Copy your Zero-Login signed Master Auth URL from <Link href="/settings" style={{ color: "var(--primary)", textDecoration: "underline" }}>Settings</Link>.</span>
            </div>
          </div>
        </section>

        {/* How Kankali Operates (4-Step Process) */}
        <section id="architecture" className="operates-section">
          <h2>How Kankali Operates</h2>
          <p>A transparent, four-step process to persistent AI memory.</p>

          <div className="operates-grid">
            {/* Step 1 */}
            <div className="operate-card">
              <div className="operate-card__badge">1</div>
              <div className="operate-card__icon">
                <ShieldIcon size={22} color="var(--primary)" />
              </div>
              <h3 className="operate-card__title">Sign In</h3>
              <p className="operate-card__desc">
                Authenticate with Google OAuth to enable your private Google Drive AppData vault.
              </p>
            </div>

            {/* Step 2 */}
            <div className="operate-card">
              <div className="operate-card__badge">2</div>
              <div className="operate-card__icon">
                <GithubIcon size={22} />
              </div>
              <h3 className="operate-card__title">Connect Storage</h3>
              <p className="operate-card__desc">
                Optionally link your private GitHub repository for team versioning and git commits.
              </p>
            </div>

            {/* Step 3 */}
            <div className="operate-card">
              <div className="operate-card__badge">3</div>
              <div className="operate-card__icon">
                <CodeIcon size={22} color="var(--color-cyan)" />
              </div>
              <h3 className="operate-card__title">Attach MCP Connector</h3>
              <p className="operate-card__desc">
                Paste your Master Auth URL into Claude, Cursor, ChatGPT, or Grok as a Custom MCP server.
              </p>
            </div>

            {/* Step 4 */}
            <div className="operate-card operate-card--active">
              <div className="operate-card__badge operate-card__badge--solid">4</div>
              <div className="operate-card__icon" style={{ color: "var(--tertiary)" }}>
                <SparklesIcon size={22} color="var(--tertiary)" />
              </div>
              <h3 className="operate-card__title">Persistent Memory</h3>
              <p className="operate-card__desc">
                Context flows seamlessly across all sessions with anchor-based micro-chunk retrieval.
              </p>
            </div>
          </div>
        </section>

        {/* Security & Strict Vault Isolation Banner */}
        <section id="security" className="security-banner">
          <div className="security-banner__icon-box">
            <ShieldIcon size={38} color="var(--primary)" />
          </div>

          <div className="security-banner__content">
            <h3>Zero AI Training &amp; Self-Custodial Isolation</h3>
            <p>
              Kankali acts purely as a stateless transport layer. We do not inspect, log, or train on your contextual data. Your memory vault resides exclusively in your own Google Drive AppData sandbox or your designated GitHub repository.
            </p>
            <Link href="/security" className="security-banner__link">
              REVIEW SECURITY ARCHITECTURE &amp; AUDIT →
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-left">
          <span className="footer-brand-title">KANKALI CONTEXT</span>
          <span>© 2026 Kankali Project. Open-Source AI Context &amp; Memory Protocol.</span>
        </div>

        <div className="footer-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/security">Security Audit</Link>
          <Link href="/status">System Status</Link>
          <a href="https://github.com/JBPATEL06/kankali-context" target="_blank" rel="noopener noreferrer">
            GitHub Repository
          </a>
        </div>
      </footer>
    </div>
  );
}
