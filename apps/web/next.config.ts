import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile workspace packages so Next.js can handle them directly.
  transpilePackages: ["@roomrush/shared"],
};

export default nextConfig;
