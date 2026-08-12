"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";

export default function Home() {
  const { data: session, status } = useSession();

  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem", lineHeight: 1.6 }}>
      <h1 style={{ color: "#7dba6a", fontWeight: 600 }}>Kankali</h1>
      <p style={{ opacity: 0.85 }}>
        Portable memory layer for AI assistants. Sign in, connect <em>your</em> GitHub
        repo, and every AI (Claude, Grok, …) shares the same context via MCP.
      </p>

      <div style={{ marginTop: "2rem" }}>
        {status === "loading" && <p>Loading…</p>}
        {status === "unauthenticated" && (
          <button
            onClick={() => signIn("google")}
            style={btnStyle}
          >
            Sign in with Google
          </button>
        )}
        {status === "authenticated" && session?.user && (
          <div>
            <p>
              Signed in as <strong>{session.user.email}</strong>
            </p>
            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
              <Link href="/settings" style={{ ...btnStyle, textDecoration: "none" }}>
                Settings → connect GitHub
              </Link>
              <button onClick={() => signOut()} style={{ ...btnStyle, background: "#1e3a2a" }}>
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>

      <h2 style={{ color: "#c9a227", marginTop: "3rem" }}>How it works</h2>
      <ol style={{ opacity: 0.9 }}>
        <li>Sign in with Google</li>
        <li>Paste a fine-grained GitHub PAT + your context repo</li>
        <li>Copy your MCP API key into Claude / Grok / Cursor</li>
        <li>AIs read &amp; write context into <em>your</em> repo via Kankali</li>
      </ol>

      <p style={{ marginTop: "2rem", fontSize: "0.875rem", opacity: 0.55 }}>
        GitHub tokens are encrypted at rest in Firebase. We email you before they expire.
      </p>
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#7dba6a",
  color: "#0d1a12",
  border: "none",
  borderRadius: 8,
  padding: "0.75rem 1.25rem",
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-block",
};
