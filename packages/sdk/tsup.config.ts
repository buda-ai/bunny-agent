import { defineConfig } from "tsup";

export default defineConfig([
  // Provider (backend) - no "use client" banner
  {
    entry: {
      index: "src/index.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    external: [
      "@sandagent/manager",
      "@ai-sdk/provider",
      "@ai-sdk/provider-utils",
      "ai",
    ],
  },
  // React hooks (frontend) - with "use client" banner
  {
    entry: {
      "react/index": "src/react/index.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: true,
    sourcemap: true,
    external: ["react", "react-dom", "@ai-sdk/react", "ai"],
    esbuildOptions(options) {
      options.banner = {
        js: '"use client";',
      };
    },
  },
]);
