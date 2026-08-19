import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

const siteUrl = process.env.NEXTAUTH_URL || "https://kankali-context.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Kankali Context — Open-Source Context Protocol & Vault for AI Assistants",
    template: "%s | Kankali Context",
  },
  description:
    "Self-custodial persistent context and memory vault for Claude, Cursor, ChatGPT, and Grok. Store project architecture, memories, and SDLC docs directly in your Google Drive AppData and GitHub repo.",
  keywords: [
    "Model Context Protocol",
    "MCP Server",
    "Claude MCP",
    "Cursor AI",
    "AI Memory Vault",
    "Google Drive AppData MCP",
    "GitHub Context Layer",
    "Open Source MCP",
    "ChatGPT Connector",
    "Grok Context",
  ],
  authors: [{ name: "Kankali Project Contributors", url: "https://github.com/JBPATEL06/kankali-context" }],
  creator: "Kankali Project",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    title: "Kankali Context — Open-Source Context Protocol for AI Assistants",
    description:
      "Self-custodial context and memory vault for Claude, Cursor, ChatGPT, and Grok. Store context in your private Google Drive & GitHub.",
    siteName: "Kankali Context",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kankali Context — Open-Source AI Memory & Context Vault",
    description:
      "Zero central retention. Store AI context directly in your private Google Drive AppData and GitHub repo via Model Context Protocol.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  verification: {
    google: "google6f104555f1a86a20",
  },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect x='2' y='2' width='5.5' height='5.5' rx='1.5' fill='%2338bdf8'/><rect x='9.25' y='2' width='5.5' height='5.5' rx='1.5' fill='%238ed5ff'/><rect x='16.5' y='2' width='5.5' height='5.5' rx='1.5' fill='%2338bdf8'/><rect x='2' y='9.25' width='5.5' height='5.5' rx='1.5' fill='%238ed5ff'/><rect x='9.25' y='9.25' width='5.5' height='5.5' rx='1.5' fill='%2356e5a9'/><rect x='16.5' y='9.25' width='5.5' height='5.5' rx='1.5' fill='%238ed5ff'/><rect x='2' y='16.5' width='5.5' height='5.5' rx='1.5' fill='%2338bdf8'/><rect x='9.25' y='16.5' width='5.5' height='5.5' rx='1.5' fill='%238ed5ff'/><rect x='16.5' y='16.5' width='5.5' height='5.5' rx='1.5' fill='%2338bdf8'/></svg>",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1326",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Kankali Context",
    operatingSystem: "All",
    applicationCategory: "DeveloperApplication",
    description:
      "Open-source self-custodial persistent context and memory vault for Claude, Cursor, ChatGPT, and Grok via Model Context Protocol.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: siteUrl,
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
