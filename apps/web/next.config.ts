import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@synapse/core"],
  reactCompiler: true,
};

export default nextConfig;
