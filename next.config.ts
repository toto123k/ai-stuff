import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
  },
  serverExternalPackages: [
    "parquetjs-lite",
    "duckdb",
    "@duckdb/node-api",
    "@mapbox/node-pre-gyp",
    "better-sqlite3",
  ],
  images: {
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
    ],
  },
};

export default nextConfig;
