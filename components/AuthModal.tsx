"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { BrandLogo } from "./BrandLogo";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "signin" | "signup";
}

export function AuthModal({ isOpen, onClose, initialMode = "signin" }: AuthModalProps) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await signIn("credentials", {
        email: cleanEmail,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError(
          res.error === "CredentialsSignin"
            ? "Invalid email or password. If you haven't created an account yet, switch to 'CREATE VAULT' to register."
            : res.error
        );
        setLoading(false);
      } else {
        setSuccessMsg("Signed in successfully. Redirecting…");
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || data.error || "Failed to create account");
        setLoading(false);
        return;
      }

      setSuccessMsg("Vault created successfully! Signing you in…");

      // Automatically sign in the newly registered user
      const loginRes = await signIn("credentials", {
        email: cleanEmail,
        password,
        redirect: false,
      });

      if (loginRes?.error) {
        setMode("signin");
        setError("Account created. Please enter your password to sign in.");
        setLoading(false);
      } else {
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    } catch {
      setError("Network error while creating account. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(6, 14, 32, 0.82)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface-container-low)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          width: "100%",
          maxWidth: "26rem",
          padding: "2rem",
          boxShadow: "0 20px 48px rgba(0, 0, 0, 0.6)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1.25rem",
            right: "1.25rem",
            background: "none",
            border: "none",
            color: "var(--outline)",
            fontSize: "1.25rem",
            cursor: "pointer",
            padding: "0.25rem",
            lineHeight: 1,
          }}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ display: "inline-flex", justifyContent: "center", marginBottom: "0.75rem" }}>
            <BrandLogo size={28} />
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#ffffff", margin: "0 0 0.35rem" }}>
            {mode === "signin" ? "Sign In to Kankali" : "Create Kankali Vault"}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--on-surface-variant)", margin: 0 }}>
            Unified context memory across your AI assistants.
          </p>
        </div>

        {/* Tabs: Sign In / Create Account */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            background: "var(--surface-container-lowest)",
            padding: "0.25rem",
            borderRadius: "var(--radius-base)",
            marginBottom: "1.5rem",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            style={{
              padding: "0.45rem",
              background: mode === "signin" ? "var(--surface-container)" : "transparent",
              color: mode === "signin" ? "#ffffff" : "var(--on-surface-variant)",
              border: "none",
              borderRadius: "var(--radius-xs)",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            SIGN IN
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            style={{
              padding: "0.45rem",
              background: mode === "signup" ? "var(--surface-container)" : "transparent",
              color: mode === "signup" ? "#ffffff" : "var(--on-surface-variant)",
              border: "none",
              borderRadius: "var(--radius-xs)",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            CREATE VAULT
          </button>
        </div>

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={() => signIn("google")}
          className="btn-hero-google"
          style={{ width: "100%", justifyContent: "center", marginBottom: "1.25rem" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            margin: "1.25rem 0",
          }}
        >
          <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }}></div>
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--outline)", letterSpacing: "0.08em" }}>
            OR PASSWORD
          </span>
          <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }}></div>
        </div>

        {/* Error / Success Feedback */}
        {error && (
          <div
            style={{
              background: "rgba(244, 63, 94, 0.1)",
              border: "1px solid var(--status-critical)",
              color: "var(--status-critical)",
              padding: "0.6rem 0.85rem",
              borderRadius: "var(--radius-base)",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              marginBottom: "1rem",
              lineHeight: 1.45,
            }}
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div
            style={{
              background: "rgba(86, 229, 169, 0.1)",
              border: "1px solid var(--border-tertiary)",
              color: "var(--tertiary)",
              padding: "0.6rem 0.85rem",
              borderRadius: "var(--radius-base)",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              marginBottom: "1rem",
            }}
          >
            {successMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={mode === "signin" ? handleEmailSignIn : handleSignUp} className="form-grid">
          {mode === "signup" && (
            <div className="field">
              <label>Full Name / Identifier (Optional)</label>
              <input
                type="text"
                autoComplete="name"
                placeholder="Jeel Patel"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label>Email Address</label>
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="developer@kankali.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>Password</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="btn-text"
                style={{ fontSize: "11px", padding: 0 }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              required
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {mode === "signup" && (
            <div className="field">
              <label>Confirm Password</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-filled"
            style={{ width: "100%", marginTop: "0.5rem" }}
          >
            {loading
              ? "Processing…"
              : mode === "signin"
              ? "Sign In with Email"
              : "Create Account & Vault"}
          </button>

          {/* Bottom Switch Link */}
          <div style={{ textAlign: "center", marginTop: "0.75rem" }}>
            {mode === "signin" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className="btn-text"
                style={{ fontSize: "12px", color: "var(--on-surface-variant)" }}
              >
                Don't have an account? <strong style={{ color: "var(--primary)" }}>Create a Vault →</strong>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                className="btn-text"
                style={{ fontSize: "12px", color: "var(--on-surface-variant)" }}
              >
                Already registered? <strong style={{ color: "var(--primary)" }}>Sign In →</strong>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
