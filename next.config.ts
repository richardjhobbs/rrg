import type { NextConfig } from "next";

// The RRG app's pages are already routed under /rrg/ (app/rrg/*, app/rrg/download, etc.)
// No basePath needed — nginx proxies /rrg and /_next to this app as-is.
const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
