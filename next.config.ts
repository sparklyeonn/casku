import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El servidor temporal de pruebas no comparte caché ni bloqueo con npm run dev.
  distDir: process.env.CASKU_TEST_MODE === "1" ? process.env.CASKU_TEST_INSTANCE === "secondary" ? ".next-tests-secondary" : ".next-tests" : ".next",
  /* config options here */
  experimental: {
    agentFeedback: true,
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
