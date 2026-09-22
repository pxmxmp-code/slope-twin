import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../../.env"), quiet: true });

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: resolve(__dirname, "../.."),
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS || "127.0.0.1")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
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
