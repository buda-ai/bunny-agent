# session directory lookup: end-to-end from runner to SDK

Date: 2026-07-04 (SDK helper added 2026-07-06)

## Summary

Expose pi-runner's on-disk session directory to external callers all the
way from the runner up through the SDK, so downstream consumers never
have to hardcode pi's filesystem conventions:

- `runner-pi` now exports `getSessionDir(cwd)` — a thin wrapper around
  `SessionManager.create(cwd).getSessionDir()`.
- `runner-harness` exposes `getSessionDirForRunner(runner, cwd)` which
  dispatches to `runner-pi` (only pi is supported today; other runners
  throw).
- `apps/daemon` adds `GET /api/coding/session/dir?runner=pi&cwd=/agent` to
  both transports (standalone `server.ts` + Next.js `nextjs.ts`), returning
  `{ ok: true, data: { runner, cwd, dir } }` or `400` with the error
  message when the runner isn't supported.
- `@bunny-agent/sdk` exports `getBunnyAgentSessionDir(daemonUrl, opts?)`
  — a `fetch`-based helper that wraps the daemon endpoint, mirroring the
  existing `isBunnyAgentDaemonHealthy` pattern. Downstream apps that only
  depend on the SDK (e.g. buda) call one function instead of assembling
  a URL and parsing the envelope.

## Motivation

Product apps that share sessions (e.g. buda's "Save & Continue") need to
copy a specific pi session file from the source agent's sandbox to the
target agent's sandbox. Sandock's `fs.list/read/write` already work
per-sandbox, but the caller has to know **where** to look — pi encodes cwd
into a directory name and picks a `configDir` (`.pi`, `.bunny`, patch-
dependent) that outside code shouldn't hardcode.

This endpoint puts the truth in one place: the daemon that already has
`runner-pi` in its dependency graph answers "given `cwd`, where does your
session sit". Callers stay ignorant of pi's naming rules and any future
patch to `piConfig.configDir`.

## Changes

- `packages/runner-pi/src/session-utils.ts`
  - Add `getSessionDir(cwd)` export; reuse it inside `resolveSessionPathById`.
- `packages/runner-pi/src/index.ts`
  - Re-export `getSessionDir`.
- `packages/runner-harness/src/session-dir.ts` (new)
  - `getSessionDirForRunner(runner, cwd)` — currently only accepts `"pi"`,
    throws for other runners. Adding another runner is one case in the
    switch.
- `packages/runner-harness/src/index.ts`
  - Export `getSessionDirForRunner`.
- `apps/daemon/src/routes/coding-session-dir.ts` (new)
  - `codingSessionDir({ runner, cwd })` handler with `pi` / `/agent`
    defaults.
- `apps/daemon/src/server.ts`
  - Wire `GET /api/coding/session/dir` on the Node `http` server.
- `apps/daemon/src/nextjs.ts`
  - Wire the same endpoint on the Web `Request/Response` handler.
- `packages/sdk/src/session-dir.ts` (new)
  - `getBunnyAgentSessionDir(daemonUrl, opts?)` — wraps `fetch` +
    envelope parsing so downstream consumers don't reimplement it.
    Defaults: `runner = "pi"`, `cwd = "/agent"`. Throws with a
    descriptive message when the daemon returns non-JSON, a failure
    envelope, or a missing `data.dir`.
- `packages/sdk/src/index.ts`
  - Export `getBunnyAgentSessionDir` and
    `GetBunnyAgentSessionDirOptions`.

## Tests

- `packages/runner-pi/src/__tests__/session-utils.test.ts`
  - `getSessionDir` returns an absolute path with `/agent/sessions/`; the
    result changes with cwd.
- `apps/daemon/src/__tests__/coding.test.ts`
  - `runner-harness` mock adds a stub for `getSessionDirForRunner`.
  - 4 cases on the standalone server: default cwd, explicit cwd, omitted
    runner/cwd defaults, unsupported runner (400).
  - 2 cases through the Next handler: happy path + unsupported runner.
- `packages/sdk/src/__tests__/session-dir.test.ts`
  - 6 cases: default runner/cwd, custom runner/cwd, error envelope,
    non-JSON body, missing `data.dir`, fetch failure. All stub
    `globalThis.fetch`.

## Verification

- `pnpm --filter @bunny-agent/runner-pi test` — 130 pass
- `pnpm --filter @bunny-agent/daemon test` — 109 pass
- `pnpm --filter @bunny-agent/sdk test` — 28 pass
- `pnpm -r typecheck` — clean
- `pnpm run -w lint` — clean

## Non-goals

- CLI is intentionally not touched. This endpoint is daemon-scoped
  introspection; CLI users can `ls` locally and don't need a flag.
- Manager package is unchanged. The SDK helper hits the daemon via
  plain `fetch` (matching how it's typically reached — through a
  sandock proxy URL that consumers already have) rather than via an
  in-sandbox exec-based curl.
- Only `pi` is supported at the harness layer. Adding `claude`/`codex`/
  etc. is one switch case each — done when a runner grows a stable
  session-directory concept.

## Follow-up

- kapps repo (buda): implement `share-copy` job that
  1. hits this endpoint against the source sandbox to learn the sessions
     dir,
  2. `fs.list` there to locate `*_<piSessionId>.jsonl`,
  3. `fs.read` + `fs.write` to move the file into the target sandbox's
     matching path (target dir resolved through the same endpoint),
  4. persists `sandagentSessionId` = source pi id so the receiver's first
     turn takes the standard `resume` code path with zero special-casing.
