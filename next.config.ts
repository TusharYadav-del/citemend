import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.CITEMEND_BUILD_DIR ? { distDir: process.env.CITEMEND_BUILD_DIR } : {}),
  /* config options here */
  async headers() {
    return [
      {
        source: "/citemend-pixel.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=86400" },
        ],
      },
      {
        source: "/citefix-pixel.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        source: "/api/pixel/resolve",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
