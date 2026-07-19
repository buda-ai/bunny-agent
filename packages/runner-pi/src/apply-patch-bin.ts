/**
 * Dist sibling required by apply-patch-shim.ts's default PATH-shim
 * resolution (`new URL("./apply-patch-bin.js", import.meta.url)`), used
 * when the pi runner runs from tsc output rather than an esbuild bundle
 * (e.g. `pnpm --filter runner-pi` dev loop). The real CLI lives in
 * `@bunny-agent/apply-patch/bin`, shared with the esbuild-bundled apps
 * (runner-cli, daemon) that each produce their own standalone
 * dist/apply-patch-bin.js by bundling that same entry directly — they do
 * not go through this file.
 */
import "@bunny-agent/apply-patch/bin";
