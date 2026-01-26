import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "chat/index": "src/components/chat/index.ts",
    "tools/index": "src/components/tools/index.ts",
    "artifacts/index": "src/components/artifacts/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
  // Bundle kui into the output (not external)
  noExternal: ["kui"],
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";',
    };
  },
  async onSuccess() {
    // Merge kui styles + sandagent-ui styles into dist/styles.css
    const kuiStyles = readFileSync(
      resolve(__dirname, "../kui/src/styles.css"),
      "utf-8",
    );
    const uiStyles = readFileSync(resolve(__dirname, "src/styles.css"), "utf-8");

    mkdirSync(resolve(__dirname, "dist"), { recursive: true });
    writeFileSync(
      resolve(__dirname, "dist/styles.css"),
      `/* kui styles */\n${kuiStyles}\n\n/* sandagent-ui styles */\n${uiStyles}`,
    );
    console.log("✓ Merged styles.css");
  },
});
