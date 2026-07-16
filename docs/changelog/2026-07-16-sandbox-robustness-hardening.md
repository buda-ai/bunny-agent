# Sandbox robustness hardening: process-tree cleanup, temp-dir leak, network retry, preflight

Date: 2026-07-16

Follow-up to the LocalMachine/SrtSandbox/sandbox-local+srt-package/CI work
from earlier today (PRs #355, #356, #359, #361). Four independent
robustness gaps, each found by reproducing the failure for real before
fixing it (not guessed at).

## 1. LocalMachine: abort/timeout orphaned backgrounded grandchildren

**Repro before the fix**: ran a shell command through `LocalMachine.exec()`
that backgrounds a long-running grandchild (`(sleep 60 &) ; sleep 60`),
aborted it via `AbortSignal`, and confirmed via `ps` that the tagged
grandchild process survived — `child.kill(signal)` only ever signals the
direct child PID, not its process tree.

**Fix**: `spawn(..., { detached: true })` (POSIX: makes the child the leader
of its own process group) + a new `killProcessTree()` helper that signals
the negative PID (whole group) on POSIX or shells out to `taskkill /T` on
Windows. Applied to both `exec()`'s timeout/abort paths and
`runCommand()`'s timeout path.

**Also fixed in the same code path**: the existing "force SIGKILL after 5s
if still running" escalation checked `child.killed`, which Node sets `true`
as soon as a signal is *sent* successfully — not when the process actually
exits. That escalation essentially never fired. Now tracked via a real
`child.once("exit", ...)` flag.

**SrtSandbox needed no equivalent fix** — confirmed by the same repro
through `SrtSandbox`: srt passes bubblewrap `--unshare-pid`, so the kernel
tears down every process in that PID namespace the instant its init dies.
A regression test locks this guarantee in for both adapters.

## 2. SrtSandbox: settings-dir temp leak

**Repro**: ran one `SrtSandbox` command and called `destroy()`; the
generated `srt-sandbox-*` temp directory (holding the policy JSON) was
still there afterward. A debugging session running the test suite
repeatedly had accumulated 80+ leaked directories in `/tmp` before this fix
— confirmed by directly counting them.

**Fix**: new `LocalMachine.onDestroy()` protected hook (mirrors the existing
`transformCommand()` seam), threaded through `LocalMachineHandle`'s
constructor and called from `destroy()`. `SrtSandbox` overrides it to
`fs.rm()` the directory it created.

## 3. SandockSandbox: retry transient network errors

**Motivation**: today's own CI run hit a real `TypeError: terminated`
(cause: `SocketError: other side closed`, code `UND_ERR_SOCKET`) against
production sandock.ai — a one-off Cloudflare connection drop, not an
application error. Nothing retried it.

**Fix**: new `retry.ts` (`withNetworkRetry` + `isTransientNetworkError`,
pattern-matches the error and its `.cause` chain against known transient
signatures). Applied to every safe-to-retry call: `sandbox.get/start/create`,
`volume.getByName`, `fs.read/write`, `sandbox.stop/delete`. Deliberately
**not** applied to `sandbox.shell` (the exec/runCommand path) — an arbitrary
user command can have already caused side effects before a connection
drops, so blindly re-running it risks double-executing something
non-idempotent. `create()` is retried too, accepting a documented, small
risk: if the request reached the server but the response was lost, a retry
could create a second sandbox — sandock's API has no idempotency-key
mechanism to close that gap.

## 4. SrtSandbox: preflight check with actionable errors

**Repro before the fix**: hid `bwrap`/`socat`/`rg` from `PATH` and ran a
real command through `SrtSandbox`. srt's own error ("Sandbox dependencies
not available: ripgrep (rg) not found, ...") was already reasonably clear,
but only surfaced deep inside the first `exec()` call, and had no
installation guidance.

**Fix**: `SrtSandbox.attach()` now runs a cheap srt-wrapped no-op probe
(`node -e "process.exit(0)"` — chosen because Node is always present,
unlike `true`/`echo`) before any real work. A failure matching srt's own
"Sandbox dependencies not available" signature gets an appended,
platform-aware install hint (`apt-get`/`brew`, plus the Ubuntu 24.04+
AppArmor/userns note this repo's own CI setup needed). A failure *not*
matching that signature gets a generic "preflight failed" wrapper instead
of being mislabeled as a missing dependency. Only runs once per instance
(skipped if already attached).

## Testing

- `sandbox-local`: 24/24 (2 new process-tree tests — confirmed they fail
  without the fix, pass with it, by temporarily reverting the fix during
  verification).
- `sandbox-srt`: 14/14 (1 new PID-namespace regression test, 1 new
  settings-dir cleanup test, 3 new `buildInstallHint` unit tests, 4 new
  preflight tests using a fake `srtCommand` — deterministic, no real
  bwrap/socat/rg dependency).
- `sandbox-sandock`: 50/52 (9 new retry unit tests; 2 pre-existing live
  tests skip without `BUNNY_INTEGRATION`+`SANDOCK_API_KEY`, as before).
- Full live E2E (`manager-cli`'s `live-e2e.test.ts`, `BUNNY_INTEGRATION=1`):
  3/3 — LocalMachine and SrtSandbox each completing a real agent turn
  through the real runner-cli and the mock LLM, confirming none of the four
  fixes regressed the actual end-to-end path.
- `pnpm -r build`, `pnpm -r typecheck`, `pnpm run -w lint`: all green.

## Known gap

Live re-verification of the Sandock round trip against production
sandock.ai could not be completed this session — `SANDOCK_API_KEY` in the
local `.env.integration` file has been revoked/expired (confirmed with a
raw `curl` bypassing all adapter code, ruling out a code regression). The
retry logic is unit-tested and the one live attempt made correctly did
**not** retry the resulting 401 (proving the transient-vs-application-error
distinction works), but a fresh key is needed to re-run the live round trip
end to end.
