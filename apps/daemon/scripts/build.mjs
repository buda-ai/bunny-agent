import * as esbuild from "esbuild";

// Banner: polyfill `require` in ESM context so CJS dependencies
// that call require("os"), require("path"), etc. work correctly.
const banner = {
  js: 'import { createRequire as __banner_cjsRequire } from "module"; const require = __banner_cjsRequire(import.meta.url);',
};

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  banner,
};

// Library exports
await esbuild.build({
  ...shared,
  entryPoints: ["src/index.ts", "src/nextjs.ts"],
  outdir: "dist",
});

// CLI bundle
await esbuild.build({
  ...shared,
  entryPoints: ["src/cli.ts"],
  outfile: "dist/bundle.mjs",
});
