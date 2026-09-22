import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

const projectRoot = resolve(process.cwd(), "../..");

loadEnv({ path: resolve(projectRoot, ".env"), quiet: true });

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  webpack(config, { dev }) {
    if (dev)
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
      };
    return config;
  },
  async rewrites() {
    const backend = (
      process.env.BACKEND_URL || "http://127.0.0.1:8000"
    ).replace(/\/$/, "");
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/tiles/:path*", destination: `${backend}/tiles/:path*` },
    ];
  },
};
export default config;
