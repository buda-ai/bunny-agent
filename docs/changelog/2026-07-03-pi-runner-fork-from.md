# pi-runner: add forkFrom option

Date: 2026-07-03

## Summary

Add a `forkFrom?: string` option to `runner-pi` (and the daemon `/api/coding/run`
request) that snapshot-clones a source pi session into a fresh session file and
runs the current turn on top of that copy. Mutually exclusive with `sessionId`.

This is the sandagent-side hook that lets product apps implement
"save a shared session and continue chatting" without doing pi jsonl surgery
themselves — they pass the source session id, the daemon calls
`SessionManager.forkFrom(sourcePath, cwd)`, and the new session id is emitted
back through the existing message-metadata channel.

## Motivation

Product apps that share agent sessions (e.g. buda "Save & Continue" from a
public share) need to hand a receiver a working session that:

- has the full source history so the LLM keeps context,
- has a **new** pi session id so subsequent resumes don't collide with the
  source, and
- lives under the receiver's cwd / sandbox rather than the source's.

`SessionManager.forkFrom` from `@earendil-works/pi-coding-agent` already does
exactly this at the file level, but until now the runner only exposed
`sessionId` for resume — there was no way to trigger a fork through the
daemon's HTTP surface. Callers were forced to either (a) reimplement jsonl
copying outside of pi-mono, or (b) rebuild history by feeding all prior
messages back in as a fresh session, which loses pi-mono's compaction and
blows up context on long conversations.

## Changes

- `packages/runner-pi/src/pi-runner.ts`
  - Add `forkFrom?: string` to `PiRunnerOptions`. Accepts a bare pi session
    id or a full session file path.
  - In `run()`, resolve `forkFrom` first (before `sessionId`): call
    `resolveSessionPathById(cwd, forkFrom)`, then
    `SessionManager.forkFrom(sourcePath, cwd)`. Throw if the source can't
    be located so callers get a clear error instead of silently landing in
    a brand new empty session.
  - `forkFrom` and `sessionId` are mutually exclusive at the semantic level:
    if both are set, `forkFrom` wins and `sessionId` is ignored. The new id
    is emitted through the existing `message-metadata.sessionId` channel so
    downstream resumes work without extra bookkeeping.
- `packages/runner-pi/src/session-utils.ts`
  - `resolveSessionPathById` now also accepts a full path (returns it
    unchanged when it contains `/`). Eliminates the duplicated
    "path or id" ternary previously living in `pi-runner.ts`.
- `packages/runner-harness/src/runner.ts`
  - Add `forkFrom?: string` to `RunnerCoreOptions` and thread it into
    `createPiRunner`. Non-pi runners ignore it.
- `apps/daemon/src/routes/coding.ts`
  - Add `forkFrom?: string` to `RunRequest` and forward it to
    `createRunner` in both the `bunnyAgentRun` (Node http) and
    `codingRunStream` (Web Response) code paths. No new endpoint —
    reuses `/api/coding/run`.

## Tests

- `packages/runner-pi/src/__tests__/pi-runner.test.ts`
  - `forkFrom` calls `SessionManager.forkFrom` with `(sourcePath, targetCwd)`.
  - `forkFrom` wins over `sessionId` when both are set; `SessionManager.open`
    is not called.
  - Unresolvable `forkFrom` id throws
    `Pi runner: forkFrom source session not found: <id>` before touching
    `SessionManager.forkFrom`.
- `packages/runner-pi/src/__tests__/session-utils.test.ts`
  - `resolveSessionPathById` passes through paths containing `/` unchanged.
  - Returns `undefined` for bare ids that don't exist in the sessions dir.

## Verification

- `pnpm --filter @bunny-agent/runner-pi test` — 128 pass, 0 fail
- `pnpm --filter @bunny-agent/daemon test` — 103 pass, 0 fail
- `pnpm -r typecheck` — clean (after rebuild of runner-pi + runner-harness so
  downstream tsconfigs see the new field via published `dist/*.d.ts`)
- `pnpm run -w lint` — clean

## Non-goals

- No large-session guard on the fork path. `SessionManager.forkFrom` inherits
  the same in-memory load characteristics as `loadEntriesFromFile`; the
  existing `MAX_SESSION_FILE_BYTES = 10MB` resume guard bounds practical
  session sizes upstream so fork-time OOM is not a realistic risk today.
  If session sizes grow beyond that, a fork-time size check can be added in
  a follow-up without changing the API.
- No cross-sandbox fork. `forkFrom` operates against session files already
  visible to the calling daemon's fs. Getting a source session into the
  target sandbox (e.g. object-storage snapshot upload/download) is a caller
  concern and out of scope here.

## Follow-ups

- On the buda side (kapps repo, separate PR): wire
  `continueFromSharedSession` to persist the source pi session id, and have
  `chat-service` set `forkFrom` on the daemon request the first time a
  cloned session is used.
