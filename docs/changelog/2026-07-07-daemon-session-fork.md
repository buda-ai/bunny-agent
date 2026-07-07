# 2026-07-07 — Daemon `POST /api/session/fork` (runner-scoped)

Adds a first-class, synchronous fork operation to the daemon so callers can
confirm — before starting any LLM turn — whether a runner supports session
forking and whether a specific source session can be cloned. Modelled on
the existing per-runner "create" dispatch (`createRunner` in
`runner-harness`): each runner package owns its own `forkXSession`,
`runner-harness` fans out by runner id, and only `pi` currently has a real
implementation. Everything else throws `RunnerForkUnsupportedError` so the
client can fall back to sending the prior conversation as an initial
prompt without a retry loop.

## Why

Buda's "continue from a shared session" flow was blocked on fork
readiness: it copied a source pi jsonl into the target sandbox and then
hoped that the runner baked into the image supported `--fork-from` when
the receiver sent the first chat turn. When it did not, the fork silently
degraded to `resume`/initial-prompt fallback and the client had no way to
detect this ahead of time. A synchronous fork endpoint gives the caller a
definitive "forked / unsupported / source-missing" signal against the
current image, so buda can decide up-front whether to persist the pi
session id on the clone row or to inline the recent history into the
first prompt.

## What changed

- **runner-pi** — new `forkPiSession(cwd, sourceSessionId)` in
  `packages/runner-pi/src/fork.ts`. Resolves the source id via the
  existing `resolveSessionPathById`, delegates to
  `SessionManager.forkFrom(sourcePath, cwd)`, and returns the new session
  id + on-disk path. Throws `ForkSourceNotFoundError` for unresolvable
  ids.
- **runner-{claude,codex,gemini,opencode}** — each package now exports a
  `forkXSession` that throws its local `RunnerForkUnsupportedError`. This
  keeps the "provider" abstraction symmetrical with `createRunner` and
  documents which runtimes have no forkable session file to clone.
- **runner-harness** — new `forkSession({ runner, cwd, sourceSessionId })`
  dispatcher mirroring `createRunner`. It normalises each runner's
  `RunnerForkUnsupportedError` (matched by `name`) into the harness's own
  class so the daemon only needs to catch one type. Re-exports
  `ForkSourceNotFoundError` so callers can distinguish "runner cannot
  fork" from "source not on disk".
- **daemon** — new `POST /api/session/fork` in
  `apps/daemon/src/routes/sessions.ts`, registered in `router.ts`. Body:
  `{ volume?, runner, sourceSessionId }`. Resolves `cwd` via the same
  `resolveVolumeRoot` helper the fs routes use, calls
  `harness.forkSession`, and translates errors into HTTP status codes:
  - `200` → `{ runner, newSessionId, newSessionPath, sourcePath }`
  - `400` → missing input or `RunnerForkUnsupportedError`
  - `404` → `ForkSourceNotFoundError` (typical when the cross-sandbox
    copy job hasn't landed the jsonl yet)
  - `500` → anything else

## Files affected

- `packages/runner-pi/src/fork.ts` (new)
- `packages/runner-pi/src/index.ts` — exports the new API.
- `packages/runner-pi/src/__tests__/fork.test.ts` (new) — covers the
  "source not on disk" and empty-id branches. The happy path uses
  `SessionManager.forkFrom` against `~/.pi/agent/sessions/<encoded-cwd>/`
  which we cannot cleanly redirect from a unit test; the daemon route
  test exercises the dispatcher end-to-end against a mocked harness.
- `packages/runner-claude/src/fork.ts` (new) + index re-exports.
- `packages/runner-codex/src/fork.ts` (new) + index re-exports.
- `packages/runner-gemini/src/fork.ts` (new) + index re-exports.
- `packages/runner-opencode/src/fork.ts` (new) + index re-exports.
- `packages/runner-harness/src/fork.ts` (new) + index re-exports.
- `apps/daemon/src/routes/sessions.ts` (new).
- `apps/daemon/src/router.ts` — registers `POST /api/session/fork`.
- `apps/daemon/src/__tests__/sessions.test.ts` (new) — 200/400/404/500
  paths, uses `vi.hoisted` to share the mock across the `vi.mock`
  factory.

## Testing

- `pnpm --filter @bunny-agent/runner-pi --filter @bunny-agent/runner-harness --filter @bunny-agent/daemon --filter @bunny-agent/runner-claude --filter @bunny-agent/runner-codex --filter @bunny-agent/runner-gemini --filter @bunny-agent/runner-opencode test` — all green (runner-pi: 130 passed, daemon: 113 passed, runner-claude: 49 passed, runner-codex: 5 passed).
- `pnpm -r typecheck` — clean.
- `pnpm run -w lint` — clean.

## Follow-ups (buda side, not in this changelog)

- Wire buda's `continueFromSharedSession` to call `POST
  /api/session/fork` synchronously after `streamCopyBetweenSandboxes`
  lands the source jsonl in the target sandbox. On 200, persist
  `sandagentSessionId = newSessionId` and drop the `pending_fork` state.
  On 400/404, fall back to inlining the last N source messages as the
  new session's `initialParts`.
- Keep the cross-sandbox jsonl copy on the buda side — the daemon can
  only see files in its own sandbox, so that step cannot move.
