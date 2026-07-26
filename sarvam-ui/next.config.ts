import type { NextConfig } from "next";

const backend =
  process.env.IDENTITYGRAPH_API_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
};

export default nextConfig;
