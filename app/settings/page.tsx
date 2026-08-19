"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { AuthModal } from "@/components/AuthModal";
import {
  ShieldIcon,
  FolderIcon,
  GoogleDriveIcon,
  GithubIcon,
  CopyIcon,
  CheckIcon,
  ClockIcon,
  KeyIcon,
  RefreshIcon,
  SparklesIcon,
  FolderOpenIcon,
} from "@/components/Icons";

type Me = {
  email: string;
  name?: string;
  mcpApiKey?: string;
  githubOwner?: string | null;
  githubRepo?: string | null;
  githubBranch?: string;
  tokenExpiresAt?: string | null;
  hasGithubToken: boolean;
  hasGoogleDrive: boolean;
};

export default function SettingsPage() {
  const { status } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [activeTab, setActiveTab] = useState<"vaults" | "security">("vaults");
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // GitHub Form state
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [expiresAt, setExpiresAt] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Master Token state (Max 60 Days)
  const [masterDays, setMasterDays] = useState(60);
  const [customDate, setCustomDate] = useState("");
  const [masterToken, setMasterToken] = useState<string | null>(null);
  const [masterAuthUrl, setMasterAuthUrl] = useState<string | null>(null);
  const [masterTokenExpiry, setMasterTokenExpiry] = useState<string | null>(null);
  const [generatingMaster, setGeneratingMaster] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/user/me");
      if (res.ok) {
        const data = await res.json();
        setMe(data);
        if (data.githubOwner && !data.githubOwner.includes("@")) {
          setOwner(data.githubOwner);
        } else if (data.githubOwner && data.githubOwner.includes("@")) {
          setOwner("");
        }
        setRepo(data.githubRepo || "");
        setBranch(data.githubBranch || "main");
        setExpiresAt(data.tokenExpiresAt ? data.tokenExpiresAt.slice(0, 10) : "");

        // Automatically generate Master Auth URL on load (60 days default)
        generateMasterAuth(60);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status]);

  function triggerToast(text: string, type: "success" | "error" = "success") {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3500);
  }

  function copyText(text: string, sectionKey: string) {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    triggerToast("Copied to clipboard!", "success");
    setTimeout(() => setCopiedSection(null), 2200);
  }

  async function saveGithub(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let validExpiryIso: string | null = null;
    if (expiresAt) {
      const parsed = new Date(expiresAt);
      if (!Number.isNaN(parsed.getTime())) {
        validExpiryIso = parsed.toISOString();
      }
    }

    try {
      const res = await fetch("/api/user/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          owner: owner.trim(),
          repo: repo.trim(),
          branch: branch.trim(),
          tokenExpiresAt: validExpiryIso,
        }),
      });
      const data = await res.json();
      setBusy(false);
      if (!res.ok) {
        triggerToast(data.error || "Save failed. Please check repository permissions.", "error");
        return;
      }
      triggerToast("GitHub configuration saved and verified!", "success");
      setToken("");
      load();
    } catch {
      setBusy(false);
      triggerToast("Network error while saving GitHub settings.", "error");
    }
  }

  async function rotateKey() {
    if (
      !confirm(
        "Rotate MCP API key? Any active local desktop clients will disconnect until updated."
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/user/rotate-key", { method: "POST" });
      setBusy(false);
      if (res.ok) {
        triggerToast("New MCP API key generated successfully.", "success");
        load();
      } else {
        triggerToast("Failed to rotate key.", "error");
      }
    } catch {
      setBusy(false);
      triggerToast("Network error while rotating key.", "error");
    }
  }

  async function generateMasterAuth(days = masterDays, explicitDate?: string) {
    setGeneratingMaster(true);
    try {
      const payload = explicitDate
        ? { expiresAtDate: explicitDate }
        : { expiresInDays: Math.min(days, 60) };

      const res = await fetch("/api/user/master-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setGeneratingMaster(false);
      if (!res.ok) {
        triggerToast(data.error || "Failed to generate master URL.", "error");
      } else {
        setMasterToken(data.token);
        setMasterAuthUrl(data.masterAuthUrl);
        setMasterTokenExpiry(data.expiresAt);
        setMasterDays(data.expiresInDays);
      }
    } catch {
      setGeneratingMaster(false);
      triggerToast("Network error while generating master URL.", "error");
    }
  }

  const originUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://kankali-context.vercel.app";

  const rawMasterUrl = `${originUrl}/mcp/master`;
  const gitMcpUrl = `${originUrl}/mcp/git`;
  const driveMcpUrl = `${originUrl}/mcp/Drive`;

  const finalMasterUrl = masterAuthUrl || `${rawMasterUrl}?token=${masterToken || me?.mcpApiKey || ""}`;

  // Max 60 days calculation for date picker
  const maxDateIso = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const minDateIso = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const desktopConfigJson = `{
  "mcpServers": {
    "kankali-master": {
      "url": "${rawMasterUrl}",
      "headers": {
        "Authorization": "Bearer ${masterToken || me?.mcpApiKey || "YOUR_KEY"}"
      }
    },
    "kankali-drive": {
      "url": "${driveMcpUrl}",
      "headers": {
        "Authorization": "Bearer ${me?.mcpApiKey || "YOUR_KEY"}"
      }
    },
    "kankali-git": {
      "url": "${gitMcpUrl}",
      "headers": {
        "Authorization": "Bearer ${me?.mcpApiKey || "YOUR_KEY"}"
      }
    }
  }
}`;

  if (status === "loading") {
    return (
      <main className="page-container" style={{ textAlign: "center", paddingTop: "5rem" }}>
        <div className="live-pill">
          <span className="live-pill__dot"></span> Loading Kankali Settings…
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
            <Link href="/architecture" className="nav-link">
              Architecture
            </Link>
            <Link href="/settings" className="nav-link nav-link--active">
              Settings
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
                Sign In to Settings
              </h1>
              <p style={{ color: "var(--on-surface-variant)", fontSize: "13px", margin: 0 }}>
                Sign in with Google or email to manage your vault connections and security keys.
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
          <Link href="/architecture" className="nav-link">
            Architecture
          </Link>
          <Link href="/settings" className="nav-link nav-link--active">
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

      <main className="page-container" style={{ maxWidth: "56rem" }}>
        {/* Title Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.75rem" }}>
          <div>
            <h1 style={{ fontSize: "1.85rem", fontWeight: 800, margin: "0 0 0.25rem", letterSpacing: "-0.02em" }}>
              Context Settings &amp; Security
            </h1>
            <p style={{ color: "var(--text-medium)", fontSize: "0.9rem", margin: 0 }}>
              Manage your cloud storage vaults, OAuth permissions, and generate self-authenticating Master MCP URLs.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link href="/architecture" className="btn-filled" style={{ fontSize: "0.85rem", padding: "0.5rem 1rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <FolderOpenIcon size={15} /> Open File Explorer
            </Link>
          </div>
        </div>

        {/* Toast Alert */}
        {msg && (
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "4px",
              marginBottom: "1.25rem",
              fontSize: "0.85rem",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: msg.type === "success" ? "rgba(86, 229, 169, 0.12)" : "rgba(244, 63, 94, 0.12)",
              border: msg.type === "success" ? "1px solid var(--tertiary)" : "1px solid var(--status-critical)",
              color: msg.type === "success" ? "var(--tertiary)" : "var(--status-critical)",
            }}
          >
            {msg.type === "success" ? <CheckIcon size={15} color="var(--tertiary)" /> : "⚠️"} {msg.text}
          </div>
        )}

        {/* Settings Navigation Tabs */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "1.75rem",
            borderBottom: "1px solid var(--border-subtle)",
            paddingBottom: "0.5rem",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("vaults")}
            style={{
              padding: "0.5rem 1.1rem",
              borderRadius: "4px",
              fontSize: "0.88rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              border: activeTab === "vaults" ? "1px solid var(--primary-container)" : "1px solid transparent",
              background: activeTab === "vaults" ? "rgba(56, 189, 248, 0.14)" : "transparent",
              color: activeTab === "vaults" ? "var(--primary)" : "var(--on-surface-variant)",
            }}
          >
            <FolderIcon size={16} /> Vault Connections
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("security")}
            style={{
              padding: "0.5rem 1.1rem",
              borderRadius: "4px",
              fontSize: "0.88rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              border: activeTab === "security" ? "1px solid var(--primary-container)" : "1px solid transparent",
              background: activeTab === "security" ? "rgba(56, 189, 248, 0.14)" : "transparent",
              color: activeTab === "security" ? "var(--primary)" : "var(--on-surface-variant)",
            }}
          >
            <ShieldIcon size={16} /> Master Auth &amp; MCP Endpoints
          </button>
        </div>

        {/* TAB 1: VAULT CONNECTIONS */}
        {activeTab === "vaults" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            {/* 1. Google Drive Card */}
            <section className="card">
              <div className="card__header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <GoogleDriveIcon size={20} className="text-primary" />
                  <h2 className="card__title" style={{ margin: 0 }}>1. Google Drive App Data Vault</h2>
                </div>
                {me?.hasGoogleDrive ? (
                  <span className="badge-tag badge-tag--mint">CONNECTED</span>
                ) : (
                  <span className="badge-tag">NOT CONNECTED</span>
                )}
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--text-medium)", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
                Store your context inside your personal Google Drive in the hidden <code>appDataFolder</code>. Completely invisible to avoid drive clutter.
              </p>
              {!me?.hasGoogleDrive ? (
                <button
                  type="button"
                  onClick={() => signIn("google")}
                  className="btn-hero-google"
                  style={{ width: "fit-content", padding: "0.6rem 1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                  <GoogleDriveIcon size={18} /> Link Google Drive
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <p style={{ fontSize: "0.85rem", color: "var(--color-mint)", margin: 0, fontWeight: 500, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <CheckIcon size={14} color="var(--color-mint)" /> Google Drive is linked successfully.
                  </p>
                  <button
                    type="button"
                    onClick={() => signIn("google")}
                    className="btn-tonal"
                    style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                  >
                    Re-authorize
                  </button>
                </div>
              )}
            </section>

            {/* 2. GitHub Storage Vault Card */}
            <section className="card">
              <div className="card__header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <GithubIcon size={20} />
                  <h2 className="card__title" style={{ margin: 0 }}>2. GitHub Storage Vault</h2>
                </div>
                {me?.hasGithubToken ? (
                  <span className="badge-tag badge-tag--mint">CONNECTED</span>
                ) : (
                  <span className="badge-tag">NOT CONFIGURED</span>
                )}
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--text-medium)", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
                Authorize a private GitHub repository and supply a fine-grained Personal Access Token (PAT) with <strong>Contents: Read and write</strong> permissions.
              </p>

              <form onSubmit={saveGithub} className="form-grid" autoComplete="off">
                <div className="field">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label htmlFor="github-token">Personal Access Token (PAT)</label>
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="btn-text"
                      style={{ fontSize: "0.75rem", padding: 0 }}
                    >
                      {showToken ? "Hide" : "Show"}
                    </button>
                  </div>
                  <input
                    id="github-token"
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={me?.hasGithubToken ? "•••••••••••••••••••••••• (Leave blank to keep current)" : "github_pat_..."}
                    autoComplete="new-password"
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                  <div className="field">
                    <label htmlFor="github-owner">GitHub Username or Organization</label>
                    <input
                      id="github-owner"
                      type="text"
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                      placeholder="e.g. octocat or my-org"
                      autoComplete="off"
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="github-repo">Repository Name</label>
                    <input
                      id="github-repo"
                      type="text"
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      placeholder="e.g. kankali-context"
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                  <div className="field">
                    <label htmlFor="github-branch">Default Branch</label>
                    <input
                      id="github-branch"
                      type="text"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="main"
                      autoComplete="off"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="github-expiry">Token Expiry Date (Optional Reminder)</label>
                    <input
                      id="github-expiry"
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ marginTop: "0.5rem" }}>
                  <button type="submit" disabled={busy} className="btn-filled" style={{ width: "100%" }}>
                    {busy ? "Validating Connection..." : "Save & Verify Connection"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {/* TAB 2: SECURITY & MASTER MCP ENDPOINTS */}
        {activeTab === "security" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            {/* 1. Master Self-Authenticating URL Card (HIGHLIGHT) */}
            <section className="card" style={{ border: "1px solid var(--border-primary)", background: "rgba(6, 14, 32, 0.7)" }}>
              <div className="card__header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <SparklesIcon size={20} color="var(--primary)" />
                  <h2 className="card__title" style={{ margin: 0, color: "var(--primary)" }}>
                    Master Auth MCP URL (Zero-Login Connector)
                  </h2>
                </div>
                <span className="badge-tag badge-tag--mint">DUAL-CLOUD SYNC</span>
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--text-medium)", margin: "0 0 1rem", lineHeight: 1.6 }}>
                Paste this single URL directly into <strong>Claude.ai, ChatGPT, or Grok</strong> as a Custom MCP connector. <strong>No manual login or headers required!</strong> The embedded security token authenticates automatically.
              </p>

              {/* Master URL Display Box */}
              <div style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#ffffff" }}>
                  Your Master MCP URL:
                </span>
                {masterTokenExpiry && (
                  <span style={{ fontSize: "0.75rem", color: "var(--color-mint)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <ClockIcon size={13} color="var(--color-mint)" /> Expires: {new Date(masterTokenExpiry).toLocaleDateString()} ({masterDays} days)
                  </span>
                )}
              </div>

              <div className="terminal-code-box">
                <code style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
                  {finalMasterUrl}
                </code>
                <button
                  type="button"
                  onClick={() => copyText(finalMasterUrl, "url-master-full")}
                  className="btn-terminal-copy"
                >
                  {copiedSection === "url-master-full" ? (
                    <span style={{ color: "var(--color-mint)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <CheckIcon size={12} color="var(--color-mint)" /> COPIED
                    </span>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <CopyIcon size={13} /> Copy URL
                    </span>
                  )}
                </button>
              </div>

              {/* Expiration Controls (Max 60 Days) */}
              <div style={{ marginTop: "1.25rem", padding: "1rem", background: "rgba(0, 0, 0, 0.3)", borderRadius: "6px", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#ffffff", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <ClockIcon size={14} color="var(--primary)" /> Token Expiration Period (Max 60 Days)
                    </span>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.15rem 0 0" }}>
                      Select validity duration or pick an expiration date up to 60 days from now.
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    {/* Quick Preset Buttons */}
                    {[7, 14, 30, 60].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          setMasterDays(d);
                          setCustomDate("");
                          generateMasterAuth(d);
                        }}
                        style={{
                          padding: "0.3rem 0.6rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          border: masterDays === d && !customDate ? "1px solid var(--primary-container)" : "1px solid var(--border-subtle)",
                          background: masterDays === d && !customDate ? "rgba(56, 189, 248, 0.2)" : "rgba(0, 0, 0, 0.3)",
                          color: masterDays === d && !customDate ? "var(--primary)" : "var(--on-surface-variant)",
                        }}
                      >
                        {d === 60 ? "60 Days (Max)" : `${d}d`}
                      </button>
                    ))}

                    {/* Custom Date Picker (Max 60 days) */}
                    <input
                      type="date"
                      min={minDateIso}
                      max={maxDateIso}
                      value={customDate}
                      onChange={(e) => {
                        setCustomDate(e.target.value);
                        if (e.target.value) {
                          generateMasterAuth(60, e.target.value);
                        }
                      }}
                      style={{
                        padding: "0.3rem 0.5rem",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid var(--border-subtle)",
                        color: "#ffffff",
                      }}
                      title="Custom expiration date (within 60 days)"
                    />

                    <button
                      type="button"
                      onClick={() => generateMasterAuth(masterDays, customDate || undefined)}
                      disabled={generatingMaster}
                      className="btn-filled"
                      style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      <RefreshIcon size={12} className={generatingMaster ? "animate-spin" : ""} />
                      {generatingMaster ? "Regenerating..." : "Regenerate"}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Individual Vault Endpoints */}
            <section className="card">
              <div className="card__header">
                <h2 className="card__title">Individual Vault Remote Endpoints</h2>
              </div>

              {/* GitHub Remote Connector */}
              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#ffffff", margin: "0.75rem 0 0.35rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <GithubIcon size={15} /> GitHub Dedicated Connector URL:
              </p>
              <div className="terminal-code-box">
                <code>{gitMcpUrl}</code>
                <button
                  type="button"
                  onClick={() => copyText(gitMcpUrl, "url-git")}
                  className="btn-terminal-copy"
                >
                  {copiedSection === "url-git" ? (
                    <span style={{ color: "var(--color-mint)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                      COPIED
                    </span>
                  ) : (
                    "Copy"
                  )}
                </button>
              </div>

              {/* Google Drive Remote Connector */}
              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#ffffff", margin: "1.25rem 0 0.35rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <GoogleDriveIcon size={15} /> Google Drive Dedicated Connector URL:
              </p>
              <div className="terminal-code-box">
                <code>{driveMcpUrl}</code>
                <button
                  type="button"
                  onClick={() => copyText(driveMcpUrl, "url-drive")}
                  className="btn-terminal-copy"
                >
                  {copiedSection === "url-drive" ? (
                    <span style={{ color: "var(--color-mint)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                      COPIED
                    </span>
                  ) : (
                    "Copy"
                  )}
                </button>
              </div>

              {/* Permanent Bearer API Key */}
              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#ffffff", margin: "1.25rem 0 0.35rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <KeyIcon size={15} /> Permanent Bearer API Key:
              </p>
              <div className="terminal-code-box">
                <code>{me?.mcpApiKey || "Generating key…"}</code>
                <button
                  type="button"
                  onClick={() => copyText(me?.mcpApiKey || "", "key")}
                  className="btn-terminal-copy"
                  disabled={!me?.mcpApiKey}
                >
                  {copiedSection === "key" ? (
                    <span style={{ color: "var(--color-mint)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                      COPIED
                    </span>
                  ) : (
                    "Copy"
                  )}
                </button>
              </div>

              <div style={{ marginTop: "0.75rem", display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={rotateKey}
                  disabled={busy}
                  className="btn-tonal"
                  style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <RefreshIcon size={13} /> Rotate Permanent Key
                </button>
              </div>
            </section>

            {/* 3. Claude Desktop JSON Config */}
            <section className="card">
              <div className="card__header">
                <h2 className="card__title">Claude Desktop &amp; Cursor JSON Configuration</h2>
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-medium)", margin: "0 0 0.75rem" }}>
                Copy this block directly into your <code>claude_desktop_config.json</code>:
              </p>
              <div style={{ position: "relative" }}>
                <pre style={{
                  background: "#04070d",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "6px",
                  padding: "1rem",
                  overflowX: "auto",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.825rem",
                  color: "var(--color-cyan-light)",
                  margin: 0
                }}>
                  {desktopConfigJson}
                </pre>
                <div style={{ position: "absolute", top: "0.6rem", right: "0.6rem" }}>
                  <button
                    type="button"
                    onClick={() => copyText(desktopConfigJson, "desktop-json")}
                    className="btn-tonal"
                    style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                  >
                    {copiedSection === "desktop-json" ? <CheckIcon size={12} color="var(--tertiary)" /> : <CopyIcon size={12} />}
                    {copiedSection === "desktop-json" ? "COPIED" : "Copy JSON"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
