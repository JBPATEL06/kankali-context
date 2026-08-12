"use client";

import { useSession, signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

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
        setError(data.error_description || data.error || "Consent failed");
        setBusy(false);
        return;
      }
      window.location.href = data.redirect;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setBusy(false);
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <main style={wrap}>
        <p>Signing you in…</p>
      </main>
    );
  }

  const email = session?.user?.email || "your account";

  return (
    <main style={wrap}>
      <h1 style={{ color: "#7dba6a", fontWeight: 600 }}>Authorize Kankali</h1>
      <p style={{ opacity: 0.9 }}>
        <strong>{clientId ? "Claude / MCP client" : "An MCP client"}</strong> wants
        access to your Kankali context (read &amp; write domains in your GitHub repo).
      </p>
      <p style={{ opacity: 0.75, fontSize: "0.9rem" }}>
        Signed in as <strong>{email}</strong>
      </p>
      <ul style={{ opacity: 0.85, fontSize: "0.9rem" }}>
        <li>list / read / write / search context in <em>your</em> repo only</li>
        <li>no access to other users</li>
      </ul>
      {error && (
        <p style={{ color: "#f66", marginTop: "1rem" }}>{error}</p>
      )}
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
        <button onClick={approve} disabled={busy || !clientId || !redirectUri} style={btn}>
          {busy ? "Authorizing…" : "Allow access"}
        </button>
        <button
          onClick={() => router.push("/")}
          disabled={busy}
          style={{ ...btn, background: "#1e3a2a", color: "#e8f0e8" }}
        >
          Cancel
        </button>
      </div>
    </main>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense fallback={<main style={wrap}>Loading…</main>}>
      <AuthorizeInner />
    </Suspense>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: 480,
  margin: "4rem auto",
  padding: "0 1.25rem",
  lineHeight: 1.55,
  color: "#e8f0e8",
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
