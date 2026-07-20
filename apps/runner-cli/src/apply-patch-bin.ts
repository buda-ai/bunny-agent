/**
 * Bundle entry for the standalone `apply_patch` shell command. esbuild
 * builds this into the self-contained `dist/apply-patch-bin.js` that the
 * sandbox image wires up as /usr/local/bin/apply_patch and that the pi
 * runner's PATH shim execs (see @bunny-agent/runner-pi's
 * apply-patch-shim.ts). The imported module runs the CLI on import.
 */
import "@bunny-agent/apply-patch/bin";
