import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['recharts'],
  turbopack: {
    resolveAlias: {
      recharts: 'recharts/lib/index.js',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.mlbstatic.com",
      },
    ],
  },
};

export default nextConfig;
