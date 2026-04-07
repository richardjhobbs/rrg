import type { NextConfig } from "next";

// The RRG app's pages are already routed under /rrg/ (app/rrg/*, app/rrg/download, etc.)
// No basePath needed — nginx proxies /rrg and /_next to this app as-is.
//
// output: standalone is only applied for production builds (VPS deployment).
// In dev mode it conflicts with Turbopack.
const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  turbopack: {},
  serverExternalPackages: ['agentmail', 'ethers'],
};

export default nextConfig;
