"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { BrandLogo } from "@/components/BrandLogo";
import { AuthModal } from "@/components/AuthModal";
import {
  GithubIcon,
  UserIcon,
  LogOutIcon,
  MenuIcon,
  CloseIcon,
} from "@/components/Icons";

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function openAuth(mode: "signin" | "signup") {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
    setMobileMenuOpen(false);
  }

  const username = session?.user?.email
    ? session.user.email.split("@")[0]
    : session?.user?.name || "Vault Owner";

  const navLinks = [
    { href: "/", label: "Protocol" },
    { href: "/architecture", label: "Architecture" },
    { href: "/security", label: "Security & Audit" },
    { href: "/docs", label: "Docs" },
    { href: "/status", label: "Status" },
  ];

  return (
    <>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
      />

      <header className="app-navbar">
        <div className="nav-brand-container">
          <Link href="/" className="nav-brand">
            <BrandLogo size={22} />
            <span>Kankali Context</span>
          </Link>

          {/* Mobile hamburger button */}
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>

        {/* Links Navigation */}
        <nav className={`nav-links ${mobileMenuOpen ? "nav-links--mobile-open" : ""}`}>
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link ${isActive ? "nav-link--active" : ""}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Header Actions */}
        <div className={`nav-actions ${mobileMenuOpen ? "nav-actions--mobile-open" : ""}`}>
          <a
            href="https://github.com/JBPATEL06/kankali-context"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-tonal nav-github-btn"
          >
            <GithubIcon size={14} /> <span>Open Source</span>
          </a>

          {status === "unauthenticated" && (
            <div className="nav-auth-buttons">
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
            </div>
          )}

          {status === "authenticated" && (
            <div className="nav-user-group">
              <div className="nav-user-badge" title={session?.user?.email || username}>
                <span className="user-badge-dot"></span>
                <UserIcon size={13} className="user-badge-icon" />
                <span className="user-badge-name">{username}</span>
              </div>

              <Link
                href="/settings"
                className="btn-launch btn-vault-settings"
                onClick={() => setMobileMenuOpen(false)}
              >
                Vault Settings
              </Link>

              <button
                type="button"
                onClick={() => signOut()}
                className="btn-signout"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOutIcon size={14} />
                <span className="signout-text">Sign Out</span>
              </button>
            </div>
          )}

          {status === "loading" && (
            <span className="live-pill nav-loading-pill">
              <span className="live-pill__dot"></span> Loading…
            </span>
          )}
        </div>
      </header>
    </>
  );
}
