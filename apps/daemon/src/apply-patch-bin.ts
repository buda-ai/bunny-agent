/**
 * Bundle entry for the standalone `apply_patch` shell command. esbuild
 * builds this into a self-contained `dist/apply-patch-bin.js` sitting next
 * to the daemon bundles, so the pi runner's PATH shim (runner-pi's
 * apply-patch-shim.ts) can exec it in daemon-hosted coding runs. The
 * imported module runs the CLI on import.
 */
import "@bunny-agent/runner-pi/apply-patch-bin";
