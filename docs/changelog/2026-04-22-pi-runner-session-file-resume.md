# Pi Runner: Use Session File Path for Resume to Avoid OOM

## Problem

When `NODE_OPTIONS="--max-old-space-size=350"` (or any other tightly constrained
heap size) is set, the pi runner was vulnerable to out-of-memory crashes during
session resume.

On each run with `--resume <session-id>`, the harness stored and passed back an
opaque session ID (e.g. `"abc123"`). The pi runner then called
`SessionManager.list(cwd)` — which reads and parses **every session file on disk**
just to find the matching one — before opening the right session. With many or
large sessions, this single call could exhaust 350 MB of heap and abort Node.js.

## Fix

### `packages/runner-pi/src/pi-runner.ts`

The `ensureStartEvent` generator now emits `sessionFile` alongside `sessionId` in
the `message-metadata` SSE event:

```json
{
  "type": "message-metadata",
  "messageMetadata": {
    "sessionId": "abc123",
    "sessionFile": "/home/user/.pi/agent/sessions/.../abc123.jsonl"
  }
}
```

`sessionFile` is the full file path from `session.sessionFile` (available on
`AgentSession`). It is omitted only when `session.sessionFile` is `undefined`
(e.g. in-memory sessions), preserving backward compatibility.

### `packages/runner-harness/src/runner.ts`

`captureSessionId` now prefers `sessionFile` over `sessionId` when persisting to
`.bunny-agent/session-id`. Because the stored value is now a path containing `/`,
the pi runner's existing branch:

```typescript
if (resume.includes("/")) {
  return SessionManager.open(resume);  // ← direct open, no list scan
}
```

is taken on the next run, completely bypassing `SessionManager.list()`.

## Result

- Auto-resume with a constrained heap no longer triggers a full session list scan.
- Backward compatible: if `sessionFile` is absent (old stream), the runner still
  falls back to `sessionId` and the list-based lookup.
- All 78 existing pi-runner tests pass; a new test verifies `sessionFile` emission.
