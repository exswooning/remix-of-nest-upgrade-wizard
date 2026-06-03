import type { NextConfig } from "next";

/**
 * Next 15 config. `output: 'standalone'` makes the Docker image
 * tiny — only the runtime + the pre-traced module graph ship.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
