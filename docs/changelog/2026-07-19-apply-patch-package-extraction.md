# Extract the apply_patch engine/CLI into a standalone package

Date: 2026-07-19

## Why

`apps/daemon` needed the standalone `apply_patch` CLI binary purely for its
own esbuild bundle sidecar (`dist/apply-patch-bin.js`, exec'd by the pi
runner's PATH shim), and the only way to get it was to add
`@bunny-agent/runner-pi` as a devDependency. That reads wrong: the CLI and
the V4A parsing engine underneath it (`apply-patch-core.ts`/
`apply-patch-bin.ts`) have zero pi-specific code — only the ToolDefinition
wrapper and the PATH-shim wiring actually belong to runner-pi. Daemon ended
up depending on "the pi runtime package" to get a generic patch-apply tool
that has nothing conceptually to do with pi, which is exactly the kind of
mislabeled dependency edge that makes a dependency graph hard to reason
about later (and blocks reuse if another runner ever wants the same
fallback).

## What Changed

- `packages/apply-patch` (new package, `@bunny-agent/apply-patch`): the V4A
  patch engine (`core.ts`, moved verbatim from runner-pi's
  `apply-patch-core.ts`) and the standalone CLI entry (`bin.ts`, moved from
  `apply-patch-bin.ts`). No pi dependency — `node:fs`/`node:path` only.
- `packages/runner-pi`: `apply-patch-tool.ts` now imports `applyPatch`/
  `formatPatchResult` from `@bunny-agent/apply-patch` instead of a local
  file. `apply-patch-bin.ts` is now a one-line re-export
  (`import "@bunny-agent/apply-patch/bin"`) kept only so the package's own
  tsc `dist/` still has the sibling file `apply-patch-shim.ts`'s default
  resolution expects (unbundled/dev consumption). The package.json's
  `./apply-patch-bin` subpath export is removed — nothing outside the
  package used it once `apps/runner-cli` and `apps/daemon` were repointed
  (see below), and there's no reason to keep publishing dead surface area.
- `apps/runner-cli/src/apply-patch-bin.ts` and
  `apps/daemon/src/apply-patch-bin.ts`: now import
  `@bunny-agent/apply-patch/bin` directly instead of
  `@bunny-agent/runner-pi/apply-patch-bin`.
- `apps/daemon/package.json`: the `@bunny-agent/runner-pi` devDependency
  added for the previous change is replaced with
  `@bunny-agent/apply-patch` — daemon no longer depends on runner-pi for
  this at all. `apps/runner-cli/package.json` gains the same devDependency
  (it already depended on runner-pi for unrelated harness peer-dep
  typechecking, so this only adds the correctly-scoped edge).
- Test coverage moved with the code: the V4A engine tests now live in
  `packages/apply-patch/src/__tests__/core.test.ts`; runner-pi's
  `apply-patch-tool.test.ts` keeps only the ToolDefinition-wrapper tests.
- `docs/runner-maturity.md`: documented the new package boundary.

No behavior change — this is a pure code-motion refactor. The Docker images
and esbuild build scripts from the previous change are untouched; they
still produce `dist/apply-patch-bin.js` at the same paths.

## Testing

- Unit: `packages/apply-patch` 9/9 (moved core tests), `runner-pi` 149/149
  (2 apply-patch-tool tests trimmed to wrapper-only + unchanged shim/
  tool-overrides tests), `daemon` 107/107, `runner-cli` 24/24.
- `pnpm run -w lint` and `pnpm -r typecheck` (scoped to the four touched
  packages) clean.
- Rebuilt `runner-pi`, `runner-cli`, `daemon` from scratch and re-ran the
  same end-to-end PATH-shim + chained-heredoc check as the previous change
  to confirm the moved code still resolves and runs identically.
