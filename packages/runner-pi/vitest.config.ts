import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@sandagent/runner-harness/web-tools": resolve(__dirname, "../../packages/runner-harness/src/web-tools.ts"),
      "@sandagent/runner-harness/image-tools": resolve(__dirname, "../../packages/runner-harness/src/image-tools.ts"),
      "@sandagent/runner-harness": resolve(__dirname, "../../packages/runner-harness/src/index.ts"),
    },
  },
});
