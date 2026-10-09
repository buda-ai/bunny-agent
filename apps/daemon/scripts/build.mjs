import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sharedEsbuildOptions as shared } from "./esbuild-shared.mjs";

// Resolve from apps/daemon (not only scripts/), so `node scripts/build.mjs` always finds the package.
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(packageRoot, "package.json"));
const esbuild = require("esbuild");

// Library exports. Build with `metafile: true` so we can
// locate Pi's installed `utils/image-resize.js` (and sibling
// `image-resize-worker.js`) and the Photon package directory from the
// metafile's real resolved input paths, instead of guessing node_modules
// layout or hardcoding .pnpm paths.
const libraryBuild = await esbuild.build({
  ...shared,
  entryPoints: ["src/index.ts", "src/nextjs.ts", "src/shared/git-types.ts"],
  outdir: "dist",
  metafile: true,
});

const inputPaths = Object.keys(libraryBuild.metafile.inputs);
const imageResizeInput = inputPaths.find((p) =>
  p.endsWith("/utils/image-resize.js"),
);
const photonInput = inputPaths.find((p) => p.endsWith("/photon_rs.js"));
if (!imageResizeInput || !photonInput) {
  throw new Error(
    "Could not locate Pi's image-resize.js or Photon's photon_rs.js in the esbuild metafile. " +
      "Check that @earendil-works/pi-coding-agent still ships utils/image-resize.js and depends on @silvia-odwyer/photon-node.",
  );
}

const piUtilsDir = dirname(resolve(packageRoot, imageResizeInput));
const workerEntry = join(piUtilsDir, "image-resize-worker.js");
const photonWasmSrc = join(
  dirname(resolve(packageRoot, photonInput)),
  "photon_rs_bg.wasm",
);

// Standalone worker outfile. `resizeImage()` spawns
// `new Worker(new URL("./image-resize-worker.js", import.meta.url))`, which
// resolves relative to wherever the importing bundle (dist/index.js etc.) is
// emitted. esbuild does not discover the Worker URL as an entry point,
// so without this explicit bundle the sibling worker cannot be loaded and
// resizing silently falls back to (equally broken) in-process Photon.
await esbuild.build({
  ...shared,
  entryPoints: [workerEntry],
  outfile: "dist/image-resize-worker.js",
});

// Photon's bundled wasm loader does `readFileSync(join(__dirname, "photon_rs_bg.wasm"))`.
// Copy the real wasm binary next to every emitted bundle (library outputs,
// the worker, and the CLI bundles below) so the banner's bundle-relative
// `__dirname` finds it without reaching into node_modules at runtime.
copyFileSync(photonWasmSrc, join(packageRoot, "dist", "photon_rs_bg.wasm"));

// CLI bundle
await esbuild.build({
  ...shared,
  entryPoints: ["src/cli.ts"],
  outfile: "dist/bundle.mjs",
});

// Standalone apply_patch shell command, exec'd by runner-pi's PATH shim.
await esbuild.build({
  ...shared,
  entryPoints: ["src/apply-patch-bin.ts"],
  outfile: "dist/apply-patch-bin.js",
  allowOverwrite: true,
});
