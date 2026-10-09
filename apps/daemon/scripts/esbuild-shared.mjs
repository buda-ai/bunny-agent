// Shared esbuild configuration for apps/daemon's production bundles
// (scripts/build.mjs) and its packaging regression test
// (src/__tests__/image-resize-packaging.test.ts). Kept in one place so the
// test exercises the exact settings used to produce the published artifact.

// Banner: polyfill `require` in ESM context so CJS dependencies that call
// require("os"), require("path"), etc. work correctly. Also polyfill
// `__dirname` so bundled CJS deps that read sibling files on disk (e.g. Pi's
// Photon wrapper reading its WASM binary) resolve relative to the emitted
// bundle instead of throwing on the undefined ESM global.
export const banner = {
  js: [
    'import { createRequire as __banner_cjsRequire } from "module";',
    'import { fileURLToPath as __banner_fileURLToPath } from "node:url";',
    'import { dirname as __banner_dirname } from "node:path";',
    "const require = __banner_cjsRequire(import.meta.url);",
    "const __dirname = __banner_dirname(__banner_fileURLToPath(import.meta.url));",
  ].join(" "),
};

export const sharedEsbuildOptions = {
  bundle: true,
  platform: "node",
  format: "esm",
  banner,
  external: ["jiti"],
};
