import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve from apps/daemon (not only scripts/), so `node scripts/build.mjs` always finds the package.
const require = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
);
const esbuild = require("esbuild");

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
  entryPoints: ["src/index.ts", "src/nextjs.ts", "src/shared/git-types.ts"],
  outdir: "dist",
});

// CLI bundle
await esbuild.build({
  ...shared,
  entryPoints: ["src/cli.ts"],
  outfile: "dist/bundle.mjs",
});
