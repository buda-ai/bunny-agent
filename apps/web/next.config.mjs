import { createMDX } from 'fumadocs-mdx/next';

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
  ],
  async rewrites() {
    return [
      {
        source: '/docs/:path*.mdx',
        destination: '/llms.mdx/docs/:path*',
      },
    ];
  },
};

export default withMDX(config);
