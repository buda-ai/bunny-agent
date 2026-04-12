import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    outDir: "dist",
    splitting: false,
    external: ["@mariozechner/pi-coding-agent"],
  },
  {
    entry: ["src/extension.ts"],
    format: ["esm"],
    outDir: "dist",
    splitting: false,
    // runner-harness resolves at runtime via pnpm workspace — no bundling needed
    external: ["@mariozechner/pi-coding-agent", "@sandagent/runner-harness"],
  },
]);
