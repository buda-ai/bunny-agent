import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const harness = resolve(__dirname, "../../packages/runner-harness/src");

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: {
      "@sandagent/runner-harness/tools": resolve(harness, "tools/index.ts"),
      "@sandagent/runner-harness": resolve(harness, "index.ts"),
    },
  },
});
