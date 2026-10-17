# Search citation contract: runner-pi package build repair

Date: 2026-10-16

## Problem

The CI package build exposed three gaps in the earlier source-alias verification:

- The provider conformance test imported runner-harness source from inside
  runner-pi's `src` tree. Its production TypeScript configuration includes
  `src/**/*` with `rootDir: src`, so those imports caused TS6059.
- Direct assignment of a Vitest fetch mock depended on incompatible global
  Response declarations from the installed Node and fetch typings.
- New structured-carrier checks used `Object.hasOwn`, which is unavailable in
  runner-pi's existing ES2020 library target. The previous scoped check used
  ES2022 and did not reveal that incompatibility.

## Change

- Move the cross-package provider conformance test into runner-pi's `tests`
  directory, outside production `rootDir`. Vitest's default discovery still
  executes it, preserving all 22 provider conformance cases.
- Stub and restore fetch using Vitest's global-stubbing APIs.
- Use `Object.prototype.hasOwnProperty.call` for structured-carrier recognition,
  retaining own-property semantics under the package's existing ES2020 target.

## Validation

Verification passed in a fresh isolated workspace installed from the committed
lockfile. Dependency installation was filtered to the affected packages and
used `--ignore-scripts`; verification then ran the actual package scripts without
source aliases or compiler-option overrides:

- `pnpm --filter @bunny-agent/runner-pi... build`: manager, apply-patch, and Pi
  built successfully. A final Pi-only build passed after the helper was finalized.
- `pnpm --filter @bunny-agent/runner-pi typecheck`: passed with the original
  ES2020 libraries, `rootDir: src`, and all included source files.
- The four directly affected provider/stream files passed 96 tests, including
  all 22 relocated provider conformance cases.
- The complete Pi test command passed 23 files / 325 tests with one fork at a
  time and default file isolation. A diagnostic run with `singleFork` reused
  global fetch stubs and failed six HTTP cases; that override is not required
  by the package and is excluded from the successful evidence.
- Scoped Biome and diff checks passed.

Before the repair, the isolated compiler reproduced TS6059, TS2322, and TS2550.
The previous 536-test and 10-scenario integration evidence remains tied to
commit `f9d5825`; it did not verify the package's original production compiler
configuration. This follow-up does not claim a new live model/provider run or a
completed GitHub workflow. Fresh real Tavily acceptance task 7.2 remains pending.
