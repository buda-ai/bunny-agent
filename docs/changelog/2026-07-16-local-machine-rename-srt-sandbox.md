# Rename LocalSandbox → LocalMachine; add SrtSandbox (real local isolation)

Date: 2026-07-16

## Why

`LocalSandbox` was a misleading name: the adapter runs commands directly on
the host with the caller's user permissions — there is no sandbox. Anyone
picking it from the API surface could reasonably assume it was safe for
untrusted code. Meanwhile there was no way to run an agent locally *with*
actual isolation short of standing up a cloud sandbox or Docker.

## What Changed

### `LocalMachine` (was `LocalSandbox`) — packages/manager

- `packages/manager/src/local-sandbox.ts` → `local-machine.ts` (`git mv`).
- Class renamed `LocalSandbox` → `LocalMachine`, options type
  `LocalSandboxOptions` → `LocalMachineOptions`. Docs now state plainly that
  it provides **no isolation**.
- Deprecated aliases (`LocalSandbox`, `LocalSandboxOptions`) are still
  exported from `@bunny-agent/manager` and `@bunny-agent/sdk`, so existing
  consumers keep compiling; removal is deferred to the next major version.
- Log prefixes switched from `[LocalSandbox]` to a `label` field so
  subclasses log under their own name.
- New protected `transformCommand(command)` hook: subclasses can rewrite the
  argv before it is spawned. Both `exec()` and `runCommand()` route through
  it (`runCommand` now spawns the transformed `["sh", "-c", …]` argv instead
  of a hardcoded `sh` spawn).

### `SrtSandbox` — new adapter in packages/manager

Same lifecycle/API as `LocalMachine`, but every command is wrapped with
Anthropic's sandbox runtime (`@anthropic-ai/sandbox-runtime`, the sandbox
used by Claude Code): bubblewrap + network-namespace isolation on Linux,
Seatbelt (`sandbox-exec`) on macOS, `srt-sandbox` user + WFP egress fence on
Windows (alpha).

- Policy is generated from `isolation` options into a per-instance
  `srt-settings.json` under the OS temp dir:
  - Network: allow-only (`allowedDomains`, default `[]` = fully blocked),
    `deniedDomains`, `allowLocalBinding`, `allowAllUnixSockets`.
  - Writes: allow-only — workdir + OS temp dir always writable, plus
    user-supplied `allowWrite`; `denyWrite` wins over allows and always
    includes the policy file's own directory, so a sandboxed process cannot
    rewrite its own policy.
  - Reads: allowed except `denyRead` (e.g. `~/.ssh`).
  - Escape hatches: `settingsPath` (bring your own srt settings file) and
    `srtCommand` (override the wrapper argv).
- The wrapper is invoked as `node <resolved srt cli.js> --settings <file> …`
  so no PATH setup is required.

### Consumers updated

- `apps/manager-cli` (run command + both integration test suites),
  `apps/web` example, `packages/sdk` re-exports/README, provider error
  message — all now use `LocalMachine`; sdk additionally re-exports
  `SrtSandbox` and its option types.

## Testing

- `packages/manager/src/__tests__/srt-sandbox.test.ts`: **real isolation
  tests** through the actual srt wrapper (skipped automatically where the
  platform primitive is unavailable). Verified on Linux (bwrap 0.9.0):
  - command runs + write inside workdir lands on the host FS (positive
    control — this catches "srt failed to start so everything fails" false
    positives),
  - write outside allowed paths denied,
  - `denyRead` path unreadable,
  - network fully blocked by default,
  - sandboxed process cannot overwrite its own policy file.
- `local-machine.test.ts` (renamed): all prior behavior + a regression test
  that the deprecated `LocalSandbox` alias is the same class.
- `pnpm -r build`, `pnpm -r typecheck`, `pnpm run -w lint`: green.
- `@bunny-agent/manager` 93/93, `@bunny-agent/sdk` 30/30,
  `@bunny-agent/manager-cli` 11/11 tests pass.

## Environment notes (for anyone running the srt tests locally)

- Linux needs `bubblewrap` and `socat` installed. Without socat, srt fails
  with "Sandbox dependencies not available" — and because *everything* fails,
  deny-tests can false-pass; the positive-control test exists to catch this.
- Ubuntu 24.04+ restricts unprivileged user namespaces
  (`kernel.apparmor_restrict_unprivileged_userns=1`); bwrap needs an AppArmor
  profile granting `userns` (e.g. `/etc/apparmor.d/bwrap` with
  `profile bwrap /usr/bin/bwrap flags=(unconfined) { userns, }`).

## Breaking Changes

None — `LocalSandbox` / `LocalSandboxOptions` remain as deprecated aliases.
