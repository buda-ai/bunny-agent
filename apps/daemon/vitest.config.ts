import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: false,
    coverage: {
      include: ["src/**/*.ts"],
      exclude: [
        "src/__tests__/**",
        "src/cli.ts",
        "src/index.ts",
        "src/nextjs.ts",
        "src/routes/processes.ts",
        "src/server.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
