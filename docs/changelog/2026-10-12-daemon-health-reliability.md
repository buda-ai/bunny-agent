# Daemon Health Probe Reliability

## Problem and root cause

`isBunnyAgentDaemonHealthy` (`packages/manager/src/daemon-health.ts`) passed its
`timeout`/`signal` options straight through to `handle.exec` and trusted the
sandbox adapter to enforce them. If a given adapter did not honor its timeout
promptly, one stuck attempt could consume the caller's entire remaining probe
budget — turning a bounded wait into an effectively unbounded hang for that
chat turn. Every failure cause (non-200 HTTP, curl/transport exception, or a
hang) also collapsed into the same bare `catch {}`, so operators had no way to
tell "daemon not up yet" apart from "the probe itself couldn't run" from logs.

A second, separate bug was found and fixed in a follow-up pass on this same
branch: the retry loop inside `isBunnyAgentDaemonHealthy` called the
per-attempt probe (`runOneAttempt`) and read back `{ healthy, reason }`, but
silently discarded the `pending` promise `runOneAttempt` returns when an
attempt times out without the underlying `handle.exec` call confirming
settlement. With `maxAttempts > 1`, this meant the loop could start a second
`handle.exec` call for the *same* probe before the first one had actually
finished — an orphaned, overlapping exec with no way for either the caller or
the sandbox adapter to know which curl process's result it was looking at.

## Changes

- Each probe attempt is now bounded by its own `AbortController`-backed race
  against `handle.exec`, independent of the adapter's own timeout enforcement.
  On timeout the controller is aborted (propagated through `ExecOptions.signal`)
  before the attempt is treated as failed — adapters that honor `AbortSignal`
  actually stop the underlying command; adapters that don't are no worse off
  than before. This is a promise-level wait bound only: it does not and cannot
  guarantee the underlying `exec` call's actual lifetime terminates.
- Added an internal (non-public-API) failure classification —
  `ok | http-non-200 | transport-error | probe-timeout` — surfaced only through
  a new optional `onAttempt` diagnostic callback on
  `IsBunnyAgentDaemonHealthyOptions`. The existing boolean return contract of
  `isBunnyAgentDaemonHealthy` is unchanged; `onAttempt` is purely additive and
  swallows its own exceptions so a logging bug can never affect probe behavior.
- Fixed the dropped-`pending`/overlapping-exec bug above: the retry loop now
  tracks an `outstanding` promise across iterations. When an attempt times out
  without confirmed settlement, the loop waits on that promise (bounded by the
  per-attempt `timeout`, never unbounded — an unbounded wait here would turn a
  single timed-out attempt into an indefinite hang) before issuing the next
  attempt's `handle.exec` call. The final outstanding promise, if any, is never
  awaited at return time — it is consumed quietly in the background — so a
  last-attempt timeout still resolves `false` promptly instead of hanging.
- Added a pre-aborted-signal short-circuit (an already-aborted `signal` passed
  in now returns `false` immediately instead of starting a doomed attempt),
  bounded stdout collection (4096 bytes, guarding against a misbehaving adapter
  streaming unbounded output), and NaN-safe parsing of `maxAttempts`/`delayMs`/
  `timeout` via a `finiteOr` helper (a `NaN` option previously could poison a
  comparison and never produce the intended fallback).
- Extended `__tests__/daemon-health.test.ts` with coverage for: a hung
  `handle.exec` that never settles (resolves `false` at the timeout bound and
  confirms `AbortController.abort()` was called), each failure classification
  branch, the previously-untested `maxAttempts > 1` + `delayMs > 0` retry path
  (first-attempt failure → second-attempt success, with the configured delay
  actually elapsing in between, and no inter-attempt delay after the final
  attempt), and — new in this pass — the overlapping-exec fix itself: a real
  `handle.exec` mock that tracks concurrent invocation counts and asserts it
  never exceeds 1 across a timed-out-then-retried call, a pre-aborted-signal
  case, a bounded-collection case, and a NaN-options-fallback case.
- Added a **real** (non-mocked) integration test suite,
  `apps/manager-cli/src/__tests__/daemon-health-local-machine-integration.test.ts`:
  exercises the actual exported `isBunnyAgentDaemonHealthy` against a real
  `@bunny-agent/sandbox-local` `LocalMachine` (real `child_process.spawn`, real
  `curl` binary) and a real Node `http` server on loopback — covering a real
  200, a real non-200, a real connection-refused (curl exit 7 against a
  genuinely non-listening port), a real retry-until-200 across attempts, and a
  real `AbortController`-driven teardown of a hung real curl process. All
  attempts completed well within the proposed 1500ms-class per-attempt budget;
  no adjustment to that budget is indicated by this run.

## Scope note

This is the SDK-side half of a two-repo change (`kapps`
`improve-daemon-health-reliability` OpenSpec proposal). Task 1.4 (cutting a new
`@bunny-agent/manager`/`@bunny-agent/sdk` release) and the corresponding `kapps`
dependency bump (Task 3.1) are **not** done here — this session has no
publishing authorization. `kapps` continues to depend on the previously
published release until a maintainer explicitly cuts and bumps to a release
containing this commit; the app-side fallback timeout wrapper
(`packages/buda-core`'s `pollDaemonHealthy`) is implemented independently in
the `kapps` repo so reliability improves there without waiting on this
package's release cadence.

## Testing

`pnpm --filter @bunny-agent/manager test` — 91 tests pass (87 from the prior
pass + 4 new overlapping-exec/pre-abort/bounded-collection/NaN-fallback cases).
`pnpm --filter @bunny-agent/manager typecheck` passes clean.
`pnpm --filter manager-cli test` — 16 tests pass (2 pre-existing live-e2e tests
skipped, as before), including the 5 new real `LocalMachine` + real HTTP
server integration tests. `pnpm --filter manager-cli typecheck` passes clean
(after building `@bunny-agent/manager`/`sandbox-local`/`runner-claude`/
`sandbox-e2b`/`sandbox-sandock`/`sandbox-srt`, which this fresh worktree had
not yet built).


## Pre-PR verification update

- Independent manager tests: 93 passed. Manager typecheck passed.
- Outstanding endpoint capacity fails closed: unconfirmed exec slots are never evicted to admit new endpoints.
- Real LocalMachine integration: 5 tests passed against curl and loopback HTTP. Remote Sandock adapters remain unverified. Boolean cancellation evidence alone does not prove OS-level termination in all adapters.
- No release/version change in this PR; publishing requires separate authorization.
