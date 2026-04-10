import { createMDX } from "fumadocs-mdx/next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: [
    "@sandagent/core",
    "@sandagent/sdk",
    "@sandagent/sandbox-e2b",
    "@sandagent/sandbox-sandock",
    "@sandagent/sandbox-daytona",
    "kui",
    "lucide-react",
  ],
  async rewrites() {
    return [
      {
        source: "/docs/:path*.mdx",
        destination: "/llms.mdx/docs/:path*",
      },
    ];
  },
};

export default withMDX(config);
