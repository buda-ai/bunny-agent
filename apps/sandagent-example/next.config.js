/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@sandagent/core",
    "@sandagent/sdk",
    "@sandagent/sandbox-e2b",
    "@sandagent/sandbox-sandock",
    "@sandagent/sandbox-daytona",
    "@sandagent/ui",
    "kui",
  ],
};

module.exports = nextConfig;
