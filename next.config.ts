import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully client-driven industrial tool; keep build simple for static hosting/publish.
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
