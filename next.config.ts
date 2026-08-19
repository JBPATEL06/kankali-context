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
};

export default nextConfig;
