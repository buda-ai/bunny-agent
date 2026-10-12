# PUL-323 review correction evidence

## Scope and result

Independent Codex corrections cover exec and its error propagation through
manager and SDK. Four adapters are covered: local, Sandock, E2B and Daytona.
No execution retry, dependency, commit, push, publish, or kapps change was added.
The SDK changeset entry was added to the existing patch changeset.

All review P1/P2 findings were addressed: output-based failure suppression,
unknown status, the local close race and spawn classification, bounded UTF-8
diagnostics, env-secret redaction, native env/cwd channels, complete Daytona
env/cwd propagation, input validation, and structured SDK terminal failures.

## Real subprocess user story

1. A user starts a runner which fails before producing protocol output.
   The real local fixture writes `abort initialization failed\n` to stderr and
   exits 23. Manager exposes `SandboxExecError`, not silent abort. AI SDK
   `fullStream` contains one error carrying exit 23 and `retryable: false`,
   followed by finish reason `error`. The real fixture's launch file contains
   exactly `launch\n`, even with AI SDK `maxRetries: 2`.
2. The runner first emits `{"type":"text","text":"partial response"}`.
   Manager and SDK deliver that output before the same terminal failure.
   Neither reports `unexpected-stream-end`; the launch count remains one.
3. A missing local executable produces `spawn_failed` in the SDK stream,
   followed by error finish. A spy verifies one exec invocation. Local real
   files with no executable permission independently cover EACCES.
4. A runner emits terminal error plus finish. The SDK emits one error and one
   finish without adding a generic EOF error. Explicit user abort is tested
   separately and does not become unexpected-end. Message text alone is not
   abort identity.
5. A slow reader pauses 150 ms after stdout while the child closes. Resuming
   settles rather than hanging, for exit 0 and exit 7. SIGTERM keeps null exit
   status and signal metadata, rather than becoming exit 0.
6. The daemon fallback executes real curl against `http://127.0.0.1:1`.
   Connection failure stays exit 7 when best-effort cleanup is made to fail.
   Only one primary exec occurs; cleanup is not an execution retry.
7. A synchronous adapter validation failure is injected before stream creation.
   SDK still emits structured error plus error finish and invokes exec once
   with `maxRetries: 2`, even when destroy fails. This boundary-only test
   complements, rather than substitutes for, the real subprocess failures.

These beats are executable assertions in `exec-propagation.test.ts` and
`exec-regressions.test.ts`, not claims about a real agent/model completion.

## Exact local observations

Command: `node /tmp/pul323-evidence.mjs`. The driver imports the built local
adapter and prints argv, stdout and structured failure from each real child.
Observed output (excluding the adapter's directory announcement):

```json
{"command":["/bin/sh","-c","printf partial; printf diagnostic >&2; exit 7"],"stdout":"partial","failure":{"code":"nonzero_exit","exitCode":7,"signal":null,"retryable":false,"stderr":"diagnostic"}}
{"command":["/tmp/pul323-missing-executable"],"stdout":"","failure":{"code":"spawn_failed","exitCode":null,"retryable":false,"stderr":"spawn /tmp/pul323-missing-executable ENOENT"}}
{"command":["/usr/local/bin/node","-e","process.kill(process.pid, 'SIGTERM')"],"stdout":"","failure":{"code":"nonzero_exit","exitCode":null,"signal":"SIGTERM","retryable":false,"stderr":""}}
{"command":["/bin/sh","-c","printf \"%s\" \"$SECRET\" >&2; exit 9"],"stdout":"","failure":{"code":"nonzero_exit","exitCode":9,"signal":null,"retryable":false,"stderr":"[redacted]"}}
```

The temporary driver is supplemental evidence; durable regression tests live
in the repository. Their SDK fixture uses a temporary CommonJS runner file,
invoked by manager's real generated argv with normal runner CLI flags.

## Commands and outcomes

```sh
pnpm --filter @bunny-agent/manager exec vitest run --silent
# 100 passed, 11 files
pnpm --filter @bunny-agent/sandbox-local exec vitest run --silent
# 29 passed, 2 files
pnpm --filter @bunny-agent/sandbox-sandock exec vitest run src/__tests__/sandock-real-shell.test.ts src/__tests__/sandock-sandbox.test.ts src/__tests__/retry.test.ts --silent
# 73 passed, 3 files (23 real-shell tests)
pnpm --filter @bunny-agent/sandbox-e2b exec vitest run src/__tests__/e2b-real-shell.test.ts --silent
# 16 passed, 1 file
pnpm --filter @bunny-agent/sandbox-daytona exec vitest run src/__tests__/daytona-real-shell.test.ts src/__tests__/daytona-sandbox.test.ts --silent
# 38 passed, 2 files
pnpm --filter @bunny-agent/sdk exec vitest run --silent
# 50 passed, 7 files (9 manager/SDK propagation regressions)

pnpm --filter @bunny-agent/manager --filter @bunny-agent/sandbox-local --filter @bunny-agent/sandbox-sandock --filter @bunny-agent/sandbox-e2b --filter @bunny-agent/sandbox-daytona typecheck
# All five scoped packages: Done (manager plus four adapters)
pnpm --filter @bunny-agent/manager --filter @bunny-agent/sandbox-local --filter @bunny-agent/sandbox-sandock --filter @bunny-agent/sandbox-e2b --filter @bunny-agent/sandbox-daytona build
# All five scoped packages: Done
pnpm --filter @bunny-agent/sdk exec tsc --noEmit -p /tmp/pul323-sdk-typecheck.json
# Exit 0; isolated changed provider and regression test, with transitive imports
git diff --check
# Exit 0
```

Changed-file Biome checks cover the 17 changed/new TypeScript files, not
package directories or the entire repository. Formatting and checks pass.

```sh
pnpm exec biome check \
  packages/manager/src/types.ts \
  packages/manager/src/bunny-agent.ts \
  packages/manager/src/index.ts \
  packages/manager/src/sandbox-exec-error.ts \
  packages/manager/src/shell-escape.ts \
  packages/manager/src/__tests__/sandbox-exec-error.test.ts \
  packages/manager/src/__tests__/shell-escape.test.ts \
  packages/sandbox-local/src/local-machine.ts \
  packages/sandbox-local/src/__tests__/exec-regressions.test.ts \
  packages/sandbox-sandock/src/sandock-sandbox.ts \
  packages/sandbox-sandock/src/__tests__/sandock-real-shell.test.ts \
  packages/sandbox-e2b/src/e2b-sandbox.ts \
  packages/sandbox-e2b/src/__tests__/e2b-real-shell.test.ts \
  packages/sandbox-daytona/src/daytona-sandbox.ts \
  packages/sandbox-daytona/src/__tests__/daytona-real-shell.test.ts \
  packages/sdk/src/provider/bunny-agent-language-model.ts \
  packages/sdk/src/__tests__/exec-propagation.test.ts
# Checked 17 files. No fixes needed.
```

SDK package `typecheck` and `build` were also attempted. Both fail on unchanged
`src/index.ts:43,44`: TS2307 for `@bunny-agent/sandbox-srt` declarations.
`git show HEAD:packages/sdk/src/index.ts` confirms these imports are baseline.
SDK JavaScript bundles built successfully; its main declaration build did not.
The isolated typecheck extends the SDK config and includes only the changed
provider and new regression test, bypassing that unrelated barrel entry.
No unrelated adapter was built or edited to hide the baseline failure.

## Limits and compatibility

Remote Sandock, E2B, Daytona and Buda are NOT verified. SDK network boundaries
are shims; generated commands really execute locally through `/bin/sh -c`.
Sandock's shim passes native `env` and `workdir` into real child spawn options;
E2B does the same with `envs` and `cwd`. Daytona's quoted env/cwd shell fallback
really executes. Status-null/undefined and transport-loss scenarios are
injected at those boundaries, not induced in real remote services.

All four adapters test stderr isolation and redacted, byte-bounded diagnostic
capture with split secrets and large multibyte output. Stdout remains untouched
as the protocol channel; arbitrary secrets deliberately printed to stdout,
transformed secrets, provider-internal logging, and external retry policies
are not covered by diagnostic redaction. `retryable: false` communicates a
contract; it cannot structurally enforce behavior in external kapps or Buda.

Sandock intentionally retains single-element raw-shell compatibility; multi-
element commands use quoted argv. Portable shell callers should explicitly
use `["/bin/sh", "-c", script]`. Local remains shell-free direct argv. E2B
and Daytona preserve their existing shell-based argv interpretation.
Initialization/bootstrap shell interpolation is outside this exec-only scope.
No global tests, typechecks or lint checks were run. An initial scoped E2B
package test run included existing tests which tolerate unavailable network
credentials; final E2B verification uses only the real-shell regression file
and is not remote-service evidence. New temporary fixtures were retained.

## Orchestrator independent verification and final review

The orchestrator independently reran 188 relevant tests: manager 45, local 5,
Sandock 73, E2B 16, Daytona 38, SDK 11. All passed. Five scoped package
(manager and four adapters) typechecks and changed-file Biome passed. The isolated
changed SDK typecheck passed. A detached, unmodified origin/main worktree
reproduced exactly the same two SDK TS2307 errors, confirming baseline noise.

A final independent Claude review reproduced one additional failure: a real
runner emitted protocol finish then exited 23, and SDK silently suppressed
that trailing execution failure. The orchestrator fixed this by always emitting
the execution error, but synthesizing finish only if none was received. A new
real-subprocess fullStream test verifies one structured error, exactly one
finish, one launch with maxRetries 2, and no unexpected-stream-end fallback.
The final SDK propagation and SSE regression run passed 12 tests (10 + 2).
The isolated SDK typecheck and changed-file Biome remained clean.

Known boundary: a protocol finish already sent cannot be retracted; consumers
must observe the trailing error part, rather than treating the earlier finish
as proof of successful process exit. No duplicate finish is generated.

## Approved shipping checks

After user approval, built the SDK's existing workspace dependency with
`pnpm --filter @bunny-agent/sandbox-srt build` (no source changes). This resolved
the missing declaration artifact reported above. All six changed packages now
pass full package typecheck, and SDK build including both declaration bundles
passes. The earlier baseline failure was an unbuilt dependency, not source drift.

`pnpm -r --filter @bunny-agent/manager --filter @bunny-agent/sandbox-local
--filter @bunny-agent/sandbox-sandock --filter @bunny-agent/sandbox-e2b
--filter @bunny-agent/sandbox-daytona --filter @bunny-agent/sdk test` passed:
manager 100, local 29, Sandock 73 (2 skipped), E2B 41, Daytona 38, SDK 51:
332 passed, 2 skipped. E2B's existing tests tolerate missing/malformed credentials;
they do not establish remote service acceptance. The real-shell regression files
remain the meaningful evidence for adapter execution behavior.

The root lint script also passed. Although changed files were supplied after
`--`, the script retains its `.` argument: Biome actually checked 365 files.
No formatting changes were made. This was a lint-only scope expansion, not a
global test or typecheck run. `git diff --check` passed.
