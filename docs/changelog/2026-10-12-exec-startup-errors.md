# Structured sandbox exec startup errors (PUL-323)

## Problem and root cause

`SandboxHandle.exec()` across the remote adapters (`sandbox-sandock`,
`sandbox-e2b`, `sandbox-daytona`) had several related defects that let
deterministic startup/execution failures look identical to a clean, successful
stream end:

- **sandock**: env values were escaped for the generated `export KEY=<value>`
  shell line with `JSON.stringify(value)`. JSON double-quoting is not safe
  POSIX shell quoting — `$`, backticks, and `!` are still live inside double
  quotes, so a malicious or unusual env value could inject shell syntax. The
  process wrapper `(cmd) & echo $! > pidfile; wait $!; rm -f pidfile` also
  discarded the real exit status: the wrapping shell's own exit code became
  that of the trailing `rm`, not the user's command. A nonzero exit was only
  `console.warn`'d, never thrown.
- **e2b**: the `envExports` line escaped only `"` (`.replace(/"/g, '\\"')`),
  leaving `$`, backticks, and `!` live. `onStderr` chunks were only
  `console.error`'d, never captured for diagnostics. The command's real
  nonzero-exit signal (E2B's SDK rejects with `CommandExitError` rather than
  resolving with a nonzero `exitCode`) was only logged, never converted into a
  thrown error.
- **daytona**: argv/env escaping was already correct (POSIX single-quote).
  But `getSessionCommandLogs()` resolves to `void` — it does not report the
  exit code — so the adapter never read it; a nonzero exit was completely
  invisible and the generator just finished cleanly. stderr chunks were only
  `console.log`'d, never captured.

In all three cases, a deterministic failure (bad command, shell syntax error,
missing executable, permission denied, nonzero exit) was indistinguishable
from success at the `AsyncIterable<Uint8Array>` layer that `coding-run.ts` and
`bunny-agent.ts` consume. The SDK's stream consumer
(`packages/sdk/src/provider/bunny-agent-language-model.ts`) could then only
report a generic "stream ended unexpectedly" — never the real cause.

Separately, `onStderr` output in sandock was being pushed into the same
`queue` consumed by callers as the stdout-only AI SDK NDJSON protocol stream,
corrupting it with non-protocol bytes.

Confirmed via code reading that no retry layer wraps `exec()` or re-runs a
whole coding run: `daemon-health.ts`'s retry is for an HTTP health probe only,
and `sandbox-sandock/src/retry.ts`'s `withNetworkRetry` is deliberately **not**
applied to the exec/shell path (an arbitrary command may have already had
side effects). So this fix only needed to make `exec()` throw a correctly
shaped, explicitly non-retryable error for deterministic startup failures —
no new retry-suppression logic was required anywhere.

`sandbox-local` uses independent argv/env channels, but review found a late
close-listener race, null-status coercion, raw spawn errors, and unbounded,
unredacted stderr. These defects are corrected below.

## Initial implementation (superseded where noted)

- Added `packages/manager/src/sandbox-exec-error.ts`: a shared
  `SandboxExecError extends Error` with `code` (`spawn_failed` |
  `shell_parse_error` | `nonzero_exit` | `timeout` | `aborted`), `exitCode`,
  a `stderr` capture truncated at 4 KiB, and a literal `retryable = false`
  field communicating the no-retry contract. This field does not enforce
  behavior in external consumers. Exported from `packages/manager/src/index.ts`.
- Added `packages/manager/src/shell-escape.ts`: a shared `posixShellQuote()`
  helper (single-quote literal escaping, safe against `$`, backticks, `!`,
  newlines) used by all three remote adapters instead of three near-copies of
  escaping logic.
- **sandbox-sandock** (`sandock-sandbox.ts`): replaced `JSON.stringify` env
  escaping and manual argv escaping with `posixShellQuote`; fixed the exit
  status mask by capturing `EXIT_CODE=$?` immediately after `wait $!`, before
  the `rm -f`/`exit $EXIT_CODE` cleanup; stopped pushing `onStderr` chunks
  into the stdout protocol `queue` (now captured into a bounded 8 KiB buffer
  for diagnostics only); nonzero exit now throws `SandboxExecError` with the
  real exit code and captured stderr instead of only `console.warn`-ing.
- **sandbox-e2b** (`e2b-sandbox.ts`): switched the `NODE_PATH`/`PATH` export
  line from `"`-only escaping to `posixShellQuote`; added a bounded stderr
  capture buffer alongside the existing `console.error` mirror; the
  `commands.run()` promise's `.catch()` now classifies a thrown
  `CommandExitError` (E2B's documented nonzero-exit signal) into
  `SandboxExecError` with the real exit code and captured stderr, instead of
  only logging.
- **sandbox-daytona** (`daytona-sandbox.ts`): converged `shellEscape` and the
  env-export line onto the shared `posixShellQuote` (no behavior change, both
  already produced equivalent single-quote escaping); added a bounded stderr
  capture buffer; after `getSessionCommandLogs()` resolves (confirmed via the
  SDK's `.d.ts` that it returns `void`, not the exit code), the adapter now
  calls `sandbox.process.getSessionCommand(sessionId, cmdId)` to retrieve the
  real `exitCode` and throws `SandboxExecError` when nonzero.
- **sandbox-local** (`local-machine.ts`): the existing nonzero-exit
  `throw new Error(userMessage)` now throws `SandboxExecError` instead, for a
  consistent error shape across the four adapters. Review corrections also
  register completion before stdout consumption, classify spawn failures,
  preserve signal/null status, and bound/redact diagnostics.
- Manager and SDK abort detection now uses explicit identity/code rather than
  a message substring. The SDK emits an error part followed by an error finish
  for execution failures instead of erroring the stream controller.

## Tests

Added real-shell integration test files for sandock, e2b, and daytona
(`__tests__/{sandock,e2b,daytona}-real-shell.test.ts`, 10–15 tests each) that
mock only the respective SDK client boundary and wire the mocked
shell-execution call to actually run the generated command string through
Node's real `child_process` via `/bin/sh -c`, rather than asserting substrings
against the built command string. Covered per adapter: stdout delivery, argv
with spaces passed through unmodified, malicious env/workdir-derived values
neutralized (no injected `touch`/`$(...)` ever executes) while the literal
value still round-trips through the shell, stderr never appearing in the
stdout protocol stream (both success and failure), `SandboxExecError` with
the real exit code and captured stderr on nonzero exit, a missing executable
surfacing as exit 127 (not a silent success), already-yielded stdout chunks
delivered before a later failure is thrown, and a clean exit-0 baseline.
Sandock additionally covers a shell syntax error (unclosed quote, exit 2) and
transport rejection after output. The original suppression assertion was
incorrect and has been reversed: partial output is not completion evidence.

Added `packages/manager/src/__tests__/sandbox-exec-error.test.ts` (shape,
`retryable` always `false`, stderr truncation at 4 KiB, `instanceof Error`)
and `shell-escape.test.ts` (real `/bin/sh -c` round-trips for `posixShellQuote`
against single quotes, backtick/`$()` command substitution, variable
expansion, newlines, history-expansion-looking content, and a negative-control
injection check).

### A note on `workdir`

Initial tests injected through workdir-derived `PATH`. Review corrections
now apply defaults before sandbox and call env, so call-level `PATH` and
`NODE_PATH` are honored and tested with real subprocesses. Native env/cwd
shims pass provider options to actual child spawns; tests explicitly choose
`/tmp` as cwd where a synthetic remote workspace does not exist locally.
Separately, both adapters' `initializeSandbox()` also
interpolates `this.workdir` unescaped into other shell commands (e.g. e2b's
`` chmod 777 ${this.workdir} ``, daytona's template-copy step) — a second,
pre-existing injection site. This is out of scope for PUL-323 (`workdir` is
trusted deployment config, not request-time input funneled through `exec()`'s
command/env/argv), but worth a follow-up ticket if `workdir` is ever sourced
from untrusted input.

## Initial implementation verification (historical)

```
pnpm --filter @bunny-agent/manager --filter @bunny-agent/sandbox-sandock \
  --filter @bunny-agent/sandbox-e2b --filter @bunny-agent/sandbox-daytona \
  --filter @bunny-agent/sandbox-local typecheck
# 5/5 packages: Done, no errors

pnpm --filter @bunny-agent/manager --filter @bunny-agent/sandbox-sandock \
  --filter @bunny-agent/sandbox-e2b --filter @bunny-agent/sandbox-daytona \
  --filter @bunny-agent/sandbox-local test
# manager: 97/97 passed
# sandbox-sandock: 65/67 passed, 2 skipped (pre-existing skips)
# sandbox-e2b: 35/35 passed
# sandbox-daytona: 33/33 passed
# sandbox-local: 24/24 passed

pnpm exec biome check --write packages/manager/src packages/sandbox-sandock/src \
  packages/sandbox-e2b/src packages/sandbox-daytona/src packages/sandbox-local/src
pnpm exec biome check packages/manager/src packages/sandbox-sandock/src \
  packages/sandbox-e2b/src packages/sandbox-daytona/src packages/sandbox-local/src
# Checked 41 files, no errors
```

Not tested against a real Sandock/Daytona/E2B remote sandbox or the Buda UI —
all adapter SDK clients remain mocked at the `createSandockClient`/
`Sandbox.create`/`Daytona` client boundary. Only the generated shell command
strings were executed for real, locally, via Node's `child_process`. No
monorepo-wide `pnpm -r test`/`typecheck`/`lint` was run — only the five
touched packages, scoped via `--filter`.

## Independent review corrections

- Shared diagnostics now retain at most 4096 UTF-8 bytes while collecting;
  redaction handles secrets split across callbacks and truncated prefixes.
  Adapters do not mirror raw stderr or retain provider errors as raw causes.
- Sandock uses native `env`/`workdir`; E2B uses native `envs`/`cwd` without
  duplicate shell exports. Daytona safely exports every merged env key and
  applies cwd before executing. Invalid env keys and empty argv are rejected.
- Sandock deliberately preserves legacy single-element raw-shell commands.
  Multiple elements are quoted argv. Local uses direct argv; E2B and Daytona
  preserve their existing shell command construction. Callers needing shell
  syntax portably should use `["/bin/sh", "-c", script]`.
- No execution retry was added. Tests count actual child launches and consume
  both manager streams and AI SDK streams; the nonretryable field is a
  contract, not a guarantee about external kapps or Buda behavior.
- Synchronous adapter validation errors also become SDK in-band terminal
  errors, preventing them from entering AI SDK's pre-stream retry path.
  Cleanup failures do not replace the primary error. An abort during local
  spawn preparation is handled explicitly, including already-aborted signals.
- Verification covers four adapters, not five. Remote Sandock, E2B, Daytona
  and Buda remain unverified. See the PUL-323 verification report for current
  commands, outcomes, user-story observations, and limitations.

## Final shipping verification

The final independent review caught a process failure after a protocol finish.
SDK now emits the trailing structured error without duplicating finish, covered
by a real subprocess/fullStream regression. User approved commit and PR creation.
Building the unchanged sandbox-srt workspace dependency resolved missing SDK
artifact declarations; all six changed package typechecks and the complete SDK
build now pass. Pre-commit package tests passed 332 cases with 2 skipped.
Root lint passed; remote providers and Buda UI remain unverified. See the companion
PUL-323 verification document for commands, evidence, and limitations.
