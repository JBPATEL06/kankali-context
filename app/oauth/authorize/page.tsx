"use client";

import { useSession, signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

function AuthorizeInner() {
  const { data: session, status } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clientId = params.get("client_id") || "";
  const redirectUri = params.get("redirect_uri") || "";
  const state = params.get("state") || "";
  const codeChallenge = params.get("code_challenge") || "";
  const codeChallengeMethod = params.get("code_challenge_method") || "S256";
  const scope = params.get("scope") || "mcp:tools";
  const resource = params.get("resource") || "";
  const responseType = params.get("response_type") || "code";

  useEffect(() => {
    if (status === "unauthenticated") {
      const cb = `/oauth/authorize?${params.toString()}`;
      signIn("google", { callbackUrl: cb });
    }
  }, [status, params]);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          scope,
          resource: resource || undefined,
          response_type: responseType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error_description || data.error || "Consent authorization failed");
        setBusy(false);
        return;
      }
      window.location.href = data.redirect;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error during authorization");
      setBusy(false);
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <main className="page-container" style={{ maxWidth: "32rem", textAlign: "center", paddingTop: "5rem" }}>
        <div className="live-pill">
          <span className="live-pill__dot"></span> Authenticating via Identity Provider…
        </div>
      </main>
    );
  }

  const email = session?.user?.email || "your account";
  const clientName = clientId ? "Claude / AI Assistant" : "External MCP Client";

  return (
    <div>
      <header className="app-navbar">
        <Link href="/" className="nav-brand">
          <BrandLogo size={22} />
          <span>Kankali</span>
        </Link>
        <div className="nav-actions">
          <span className="badge-tag badge-tag--mint">OAUTH 2.1 • PKCE</span>
        </div>
      </header>

      <main className="page-container" style={{ maxWidth: "34rem" }}>
        <div className="card" style={{ marginTop: "1rem" }}>
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <div style={{
              width: "3.5rem",
              height: "3.5rem",
              margin: "0 auto 1rem",
              borderRadius: "8px",
              background: "#070a12",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-cyan-light)" }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                <rect x="9" y="11" width="6" height="4" rx="1"></rect>
                <path d="M10 11V9a2 2 0 0 1 4 0v2"></path>
              </svg>
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.4rem" }}>Authorize AI Connector</h1>
            <p style={{ fontSize: "0.9rem", color: "var(--text-medium)", margin: 0 }}>
              <strong>{clientName}</strong> is requesting access to your personal Kankali context layer.
            </p>
          </div>

          <div style={{
            background: "#070a12",
            border: "1px solid var(--border-subtle)",
            borderRadius: "6px",
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              <span className="live-pill__dot"></span>
              <span>SIGNED IN AS: <strong style={{ color: "#ffffff" }}>{email}</strong></span>
            </div>

            <div style={{ fontSize: "0.85rem", color: "#ffffff", fontWeight: 700, marginBottom: "0.5rem" }}>
              Scoped Permissions:
            </div>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.825rem", color: "var(--text-medium)", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <li>Read & write context notes in <strong>your</strong> designated GitHub repository</li>
              <li>Invoke standard `read_notice`, `read_index`, `project_*`, and session tools</li>
              <li>Strict tenant isolation (zero cross-user access)</li>
            </ul>
          </div>

          {error && (
            <div className="snackbar snackbar--error" style={{ position: "static", transform: "none", marginBottom: "1.25rem" }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
            <button
              type="button"
              onClick={approve}
              disabled={busy || !clientId || !redirectUri}
              className="btn-filled"
              style={{ flex: 1 }}
            >
              {busy ? "Authorizing…" : "Allow Access"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              disabled={busy}
              className="btn-tonal"
            >
              Cancel
            </button>
          </div>

          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.725rem", color: "var(--text-muted)", textAlign: "center", margin: "1.25rem 0 0" }}>
            PROTECTED BY PKCE S256 & RFC 7591 DCR
          </p>
        </div>
      </main>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense
      fallback={
        <main className="page-container" style={{ maxWidth: "32rem", textAlign: "center", paddingTop: "5rem" }}>
          <div className="live-pill">
            <span className="live-pill__dot"></span> Loading authorization…
          </div>
        </main>
      }
    >
      <AuthorizeInner />
    </Suspense>
  );
}
