/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@sandagent/core",
    "@sandagent/sdk",
    "@sandagent/sandbox-sandock",
    "kui",
  ],
};

module.exports = nextConfig;
