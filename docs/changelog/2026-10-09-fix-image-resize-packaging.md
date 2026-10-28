# Fix Image Resize Packaging (PUL-313)

## Problem and root cause

The daemon bundles Pi's image resize orchestrator and Photon JavaScript, but
esbuild does not discover the sibling worker referenced by `new Worker(new
URL("./image-resize-worker.js", import.meta.url))`. The worker was not emitted.
The in-process fallback also failed: bundled CommonJS Photon accesses
`__dirname`, which is undefined in ESM, and its sibling `photon_rs_bg.wasm`
was not copied. Pi catches these failures and returns `null`, producing a
misleading inline image size-limit omission message.

## Changes

- Discover Pi and Photon inputs from the production esbuild metafile, respecting
  the installed dependency graph without hardcoding pnpm storage paths.
- Bundle Pi's worker explicitly as `dist/image-resize-worker.js`, retaining the
  existing library export layout.
- Copy Photon's real WASM asset to `dist/photon_rs_bg.wasm`.
- Provide bundle-relative `__dirname` through the shared ESM banner. No
  build-machine absolute runtime path is embedded.
- Share typed esbuild configuration between production and regression probes.
- Add a daemon patch changeset; no new runtime dependency is needed.

## Verification

The focused packaging suite rebuilds production bundles before staging them
outside workspace dependencies. It checks the npm package file list, the banner
in library/CLI outputs, direct emitted-worker resizing, bundled orchestrator
worker responses, and forced-construction-failure fallback in fresh processes.
All resize paths turn the real 512x512 logo into a 32x32 PNG; assertions check
PNG signature, IHDR dimensions, metadata, and encoded size.

Independent focused runtime tests (4), daemon typecheck, explicit test-file
strict typecheck, exact-file Biome, and diff whitespace checks pass. An earlier
implementation-agent run of the wider daemon suite reported 121/124 passing
with three filesystem stream failures; that wider suite is not claimed clean.

This is packaging/runtime verification, not a production model-driven image
read session or validation of every image format/platform. No browser was used
and no visual UI evidence was produced. The assets still need a package release
before downstream consumers such as kapps can receive the fix.
