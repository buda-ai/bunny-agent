# Split local adapters into @bunny-agent/sandbox-local and @bunny-agent/sandbox-srt

Date: 2026-07-16

Follow-up to `2026-07-16-local-machine-rename-srt-sandbox.md` (PR #355).

## Why

Every other sandbox adapter (`sandbox-e2b`, `sandbox-daytona`,
`sandbox-sandock`) is a standalone package; the local adapters were the odd
ones living inside `@bunny-agent/manager`. The root README and the
`web-game-expert` template even referenced `@bunny-agent/sandbox-local`
already — the package just didn't exist. This makes the family symmetric and
keeps `manager` down to orchestration + interfaces.

## What Changed

- New package `@bunny-agent/sandbox-local`: `LocalMachine` (+ deprecated
  `LocalSandbox` alias), moved from `packages/manager/src/local-machine.ts`.
  Depends on `@bunny-agent/manager` for `buildRunnerEnv` and the
  `SandboxAdapter`/`SandboxHandle` types.
- New package `@bunny-agent/sandbox-srt`: `SrtSandbox`, moved from
  `packages/manager/src/srt-sandbox.ts`. Depends on `sandbox-local` (it
  extends `LocalMachine`) and carries the `@anthropic-ai/sandbox-runtime`
  dependency, which is removed from `manager`.
- `@bunny-agent/manager` no longer exports the local adapters (kept exporting
  them would create a dependency cycle manager → sandbox-local → manager).
  **`@bunny-agent/sdk` still re-exports `LocalMachine`, `LocalSandbox`
  (deprecated) and `SrtSandbox`**, so sdk consumers (e.g. kapps/buda) are
  unaffected. Direct manager importers switch to the new packages — updated
  in-repo: `apps/manager-cli` (run command + integration tests).
- Docs: root README package table (honest descriptions + new sandbox-srt
  row), sdk README exports table, `web-game-expert` template README now uses
  the real `new LocalMachine()` API instead of the fictional
  `createLocalSandbox()`.
- Changeset added (`minor` for manager/sandbox-local/sandbox-srt/sdk, `patch`
  for manager-cli).

## Testing

- Moved test suites run in their new homes: `sandbox-local` 23 tests,
  `sandbox-srt` 5 real-isolation tests (through actual bwrap + socat).
- `pnpm -r build`, `pnpm -r typecheck`, `pnpm run -w lint`, and the affected
  package test suites (manager, sdk, manager-cli, sandbox-local, sandbox-srt)
  all green.

## Breaking Changes

- `@bunny-agent/manager` no longer exports `LocalSandbox` /
  `LocalSandboxOptions` / `LocalMachine` / `SrtSandbox`. Migration: import
  from `@bunny-agent/sandbox-local` / `@bunny-agent/sandbox-srt`, or use the
  `@bunny-agent/sdk` re-exports (unchanged).
