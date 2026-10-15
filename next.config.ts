import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin"],
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  async rewrites() {
    return [
      { source: "/mcp/git", destination: "/api/mcp/git" },
      { source: "/mcp/git/:path*", destination: "/api/mcp/git" },
      { source: "/mcp/drive", destination: "/api/mcp/drive" },
      { source: "/mcp/drive/:path*", destination: "/api/mcp/drive" },
      { source: "/mcp/Drive", destination: "/api/mcp/drive" },
      { source: "/mcp/Drive/:path*", destination: "/api/mcp/drive" },
      { source: "/api/mcp/Drive", destination: "/api/mcp/drive" },
      { source: "/api/mcp/Drive/:path*", destination: "/api/mcp/drive" },
      { source: "/mcp/master", destination: "/api/mcp/master" },
      { source: "/mcp/master/:path*", destination: "/api/mcp/master" },
      { source: "/mcp", destination: "/api/mcp/master" },
      { source: "/mcp/:path*", destination: "/api/mcp/master" },
    ];
  },
};

export default nextConfig;
