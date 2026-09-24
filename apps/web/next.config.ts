import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@keel/hedge-sdk"],
  reactStrictMode: true,
};

export default nextConfig;
