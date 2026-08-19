import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXTAUTH_URL || "https://kankali-context.vercel.app";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/settings/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
