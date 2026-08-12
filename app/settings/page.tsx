"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

type Me = {
  email: string;
  name?: string;
  mcpApiKey?: string;
  githubOwner?: string | null;
  githubRepo?: string | null;
  githubBranch?: string;
  tokenExpiresAt?: string | null;
  hasGithubToken: boolean;
};

export default function SettingsPage() {
  const { status } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [expiresAt, setExpiresAt] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/user/me");
    if (res.ok) {
      const data = await res.json();
      setMe(data);
      setOwner(data.githubOwner || "");
      setRepo(data.githubRepo || "");
      setBranch(data.githubBranch || "main");
      setExpiresAt(data.tokenExpiresAt ? data.tokenExpiresAt.slice(0, 10) : "");
    }
  }

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status]);

  if (status === "loading") return <main style={wrap}>Loading…</main>;
  if (status === "unauthenticated") {
    return (
      <main style={wrap}>
        <p>Please sign in first.</p>
        <button onClick={() => signIn("google")} style={btn}>
          Sign in with Google
        </button>
      </main>
    );
  }

  async function saveGithub(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/user/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        owner,
        repo,
        branch,
        tokenExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Save failed");
      return;
    }
    setMsg("GitHub connected ✓");
    setToken("");
    load();
  }

  async function rotateKey() {
    if (!confirm("Rotate MCP API key? Existing AI clients will stop working until you update them.")) return;
    setBusy(true);
    const res = await fetch("/api/user/rotate-key", { method: "POST" });
    setBusy(false);
    if (res.ok) {
      setMsg("New MCP key generated");
      load();
    }
  }

  const mcpUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/mcp`
      : "https://your-app.vercel.app/mcp";

  return (
    <main style={wrap}>
      <Link href="/" style={{ color: "#7dba6a", textDecoration: "none" }}>
        ← Kankali
      </Link>
      <h1 style={{ color: "#7dba6a" }}>Settings</h1>
      {me && (
        <p style={{ opacity: 0.8 }}>
          {me.name || me.email}
        </p>
      )}

      <section style={card}>
        <h2 style={{ color: "#c9a227", marginTop: 0 }}>1. GitHub context repo</h2>
        <p style={{ fontSize: "0.9rem", opacity: 0.8 }}>
          Create an empty repo, generate a fine-grained PAT with{" "}
          <code>Contents: Read and write</code>, then paste below. Token is
          encrypted at rest.
        </p>
        <form onSubmit={saveGithub} style={{ display: "grid", gap: "0.75rem" }}>
          <label>
            GitHub PAT
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={me?.hasGithubToken ? "•••• (leave blank to keep)" : "ghp_…"}
              required={!me?.hasGithubToken}
              style={input}
            />
          </label>
          <label>
            Owner (username or org)
            <input value={owner} onChange={(e) => setOwner(e.target.value)} required style={input} />
          </label>
          <label>
            Repo name
            <input value={repo} onChange={(e) => setRepo(e.target.value)} required style={input} />
          </label>
          <label>
            Branch
            <input value={branch} onChange={(e) => setBranch(e.target.value)} style={input} />
          </label>
          <label>
            Token expiry date (optional, for reminder emails)
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              style={input}
            />
          </label>
          <button type="submit" disabled={busy} style={btn}>
            {busy ? "Saving…" : "Save & validate"}
          </button>
        </form>
        {me?.hasGithubToken && (
          <p style={{ color: "#7dba6a", marginTop: "0.75rem" }}>
            Connected: {me.githubOwner}/{me.githubRepo}@{me.githubBranch}
            {me.tokenExpiresAt && (
              <> · expires {new Date(me.tokenExpiresAt).toLocaleDateString()}</>
            )}
          </p>
        )}
      </section>

      <section style={card}>
        <h2 style={{ color: "#9b7ed9", marginTop: 0 }}>2. MCP API key</h2>
        <p style={{ fontSize: "0.9rem", opacity: 0.8 }}>
          Put this key in your AI client. Endpoint: <code>{mcpUrl}</code>
        </p>
        <pre style={pre}>{me?.mcpApiKey || "…"}</pre>
        <button onClick={rotateKey} disabled={busy} style={{ ...btn, background: "#1e3a2a", color: "#e8f0e8" }}>
          Rotate key
        </button>
        <pre style={{ ...pre, marginTop: "1rem", fontSize: "0.8rem" }}>
{`{
  "mcpServers": {
    "kankali": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer ${me?.mcpApiKey || "YOUR_KEY"}"
      }
    }
  }
}`}
        </pre>
      </section>

      {msg && (
        <p style={{ marginTop: "1rem", color: msg.includes("fail") || msg.includes("Invalid") ? "#f66" : "#7dba6a" }}>
          {msg}
        </p>
      )}
    </main>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: 640,
  margin: "2rem auto",
  padding: "0 1.25rem",
  lineHeight: 1.55,
};
const card: React.CSSProperties = {
  background: "#132218",
  border: "1px solid #1e3a2a",
  borderRadius: 12,
  padding: "1.25rem",
  marginTop: "1.5rem",
};
const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "0.55rem 0.7rem",
  borderRadius: 6,
  border: "1px solid #1e3a2a",
  background: "#0d1a12",
  color: "#e8f0e8",
  boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  background: "#7dba6a",
  color: "#0d1a12",
  border: "none",
  borderRadius: 8,
  padding: "0.65rem 1.1rem",
  fontWeight: 600,
  cursor: "pointer",
};
const pre: React.CSSProperties = {
  background: "#0d1a12",
  padding: "0.85rem 1rem",
  borderRadius: 8,
  overflow: "auto",
  border: "1px solid #1e3a2a",
  fontSize: "0.85rem",
};
