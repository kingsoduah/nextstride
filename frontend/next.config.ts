import type { NextConfig } from "next";

// Production: the browser calls same-origin /api/*, and Next.js proxies to the
// NestJS API. Set BACKEND_URL in the hosting dashboard to the deployed API
// origin. Local default keeps direct localhost:3001 communication.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/docs", destination: `${BACKEND_URL}/docs` },
      { source: "/docs/:path*", destination: `${BACKEND_URL}/docs/:path*` },
    ];
  },
};
export default nextConfig;
