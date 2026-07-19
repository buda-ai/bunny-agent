# Make apply_patch a real shell command (PATH shim + sandbox binary)

Date: 2026-07-19

## Why

The native `apply_patch` tool added on 2026-07-17 (see
`2026-07-17-pi-runner-apply-patch-tool.md`) covers bare tool calls, but
GPT-5.x also shells the command out through bash — and not only as the first
token: observed transcripts chain it after other commands, e.g.
`mkdir -p x && cd /agent && apply_patch <<'PATCH'`. Intercepting that in the
bash tool would require parsing shell syntax (`&&`, `;`, pipes, subshells)
and tracking `cd`-dependent relative paths. A real executable on PATH lets
the shell resolve all of that natively, so the model's Codex-harness habit
just works — no failed call, no fallback turn.

## What Changed

- `packages/runner-pi/src/apply-patch-core.ts` (new): the V4A patch engine,
  extracted from `apply-patch-tool.ts` into a pure-Node module (no pi
  dependencies) plus a shared `formatPatchResult` helper. The tool file
  re-exports the engine symbols so existing importers stay valid.
- `packages/runner-pi/src/apply-patch-bin.ts` (new): standalone CLI entry.
  Reads the patch from the first argument or stdin (the heredoc case),
  applies it against `process.cwd()`, prints a git-status-style `A/M/D`
  summary, exits 1 with `apply_patch: <reason>` on failure. Exposed as the
  `@bunny-agent/runner-pi/apply-patch-bin` subpath export.
- `packages/runner-pi/src/apply-patch-shim.ts` (new): materializes a
  `#!/bin/sh` wrapper named `apply_patch` in a stable per-user tmp dir,
  execing the current Node binary on the dist sibling `apply-patch-bin.js`
  (present in tsc builds by compilation and in runner-cli/daemon bundles by
  their build scripts). Returns undefined (shim skipped, old behavior) on
  Windows or when the sibling is missing.
- `packages/runner-pi/src/tool-overrides.ts`: `BashToolOptions.pathPrepend`
  — the bash tool's `spawnHook` now prepends the shim dir to the child's
  PATH.
- `packages/runner-pi/src/pi-runner.ts`: wires `ensureApplyPatchShim()` into
  the custom bash tool for all pi runs (unlike the native tool, the shim has
  no prompt-token cost, so it is not gated to the `openai` provider). When
  `options.env` is empty, a bash override is now still built if the shim is
  available.
- `apps/runner-cli` and `apps/daemon`: build a second self-contained esbuild
  bundle `dist/apply-patch-bin.js` next to the main bundle (daemon gains a
  `@bunny-agent/runner-pi` devDependency for resolution).
- `docker/bunny-agent-claude/Dockerfile{,.template,.local}`: install
  `/usr/local/bin/apply_patch` importing runner-cli's bundled bin, so the
  command exists globally for every runner in sandbox images. The npm-based
  images exit 127 (command-not-found) when the pinned runner-cli version
  predates the new dist file, preserving today's fallback behavior.
- `docs/runner-maturity.md`: documented the shell-command coverage.

## Testing

- Unit: 4 new tests in `apply-patch-shim.test.ts` (missing-bin fallback,
  wrapper materialization/permissions, argv+stdin forwarding through a
  chained `cd … && apply_patch <<'PATCH'` heredoc via PATH, idempotent
  reuse) and 3 new `pathPrepend` tests in `tool-overrides.test.ts`;
  runner-pi suite 149/149, daemon suite 107/107.
- End-to-end: built runner-cli/daemon bundles and exercised
  `mkdir -p sub && cd sub && apply_patch <<'PATCH'` with add + parent-relative
  update ops (exit 0, correct `A/M` summary, files written), error path
  (missing file → exit 1), and argv-form patch input.
- `pnpm run -w lint` and scoped `pnpm -r typecheck` clean.
