import type { NextConfig } from "next";

// NEXT_PUBLIC_BASE_PATH controls the basePath for subpath deployments.
// - VPS (richard-hobbs.com/rrg): set NEXT_PUBLIC_BASE_PATH=/rrg
// - Vercel (rrg-ruddy.vercel.app):  leave unset (root)
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  basePath,
  // Required for standalone output on VPS (smaller footprint, faster cold start)
  output: 'standalone',
};

export default nextConfig;
