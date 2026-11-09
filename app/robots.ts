import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://citemend.vercel.app").replace(/\/$/, "");
  const publicPaths = ["/", "/pricing", "/terms", "/privacy", "/refund-policy", "/audit/", "/report/"];
  return {
    rules: ["*", "Googlebot", "OAI-SearchBot", "PerplexityBot", "ClaudeBot"].map(userAgent => ({
      userAgent,
      allow: publicPaths,
      disallow: ["/dashboard", "/api/", "/sign-in", "/sign-up"],
    })),
    sitemap: `${origin}/sitemap.xml`,
  };
}
