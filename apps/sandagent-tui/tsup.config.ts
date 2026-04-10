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
    external: ["@mariozechner/pi-coding-agent"],
    noExternal: ["@sandagent/runner-harness"],
  },
]);
