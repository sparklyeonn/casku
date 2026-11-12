import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las pruebas de desarrollo y producción conservan sus propios archivos compilados.
  distDir: process.env.CASKU_PRODUCTION_TEST === "1" ? ".next-production-tests" : process.env.CASKU_TEST_MODE === "1" ? process.env.CASKU_TEST_INSTANCE === "secondary" ? ".next-tests-secondary" : ".next-tests" : ".next",
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
