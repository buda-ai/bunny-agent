---
"@bunny-agent/daemon": patch
---

Fix the esbuild bundle for `@bunny-agent/daemon` so Pi's image resize worker
and bundled Photon WASM binary are emitted and resolvable at runtime,
restoring image resizing in the published package.
