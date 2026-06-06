import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['recharts'],
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
