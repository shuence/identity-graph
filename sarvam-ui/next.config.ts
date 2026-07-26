import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // Optional: set IDENTITYGRAPH_API_URL=http://127.0.0.1:8001 to prefer Sarvam_AI/api.py
};

export default nextConfig;
