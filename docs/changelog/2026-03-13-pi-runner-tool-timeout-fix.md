# 2026-03-13 – Pi Runner: Fix Tool Timeout Error Format & Session Isolation

## Problem

Two recurring issues were observed when executing long-running bash commands
(e.g. `git clone`) through the pi runner:

### Issue 1 – "Model tried to call unavailable tool 'bash'. No tools are available."

The pi runner used `SessionManager.continueRecent(cwd)` for every new request,
even when no explicit `--resume` session ID was provided.  In persistent sandbox
environments this caused the agent to load **stale session data** from a
previous run (including old tool-call history) into the fresh context.

When the loaded session history contained tool results but the LLM API
context window limit was hit, or when the proxy was not expecting tool-call
history in the resumed context, the provider returned:

```
Model tried to call unavailable tool 'bash'. No tools are available.
```

### Issue 2 – Timeout errors show raw JSON in the UI

Pi tools return results in an internal structured format:

```json
{
  "content": [{ "type": "text", "text": "...output...\n\nCommand timed out after 10 seconds" }],
  "details": {}
}
```

The pi runner forwarded this whole object verbatim as the `output` field of the
`tool-output-available` SSE event.  Because the downstream SDK and UI treated
the output as an opaque value, users saw raw JSON in the error panel:

```
{"content":[{"type":"text","text":"Server started successfully\n...\nCommand timed out after 10 seconds"}],"details":{}}
```

instead of the readable plain-text message.

---

## Root Cause Analysis

| # | Symptom | Root cause |
|---|---------|------------|
| 1 | "No tools are available" from LLM API | `SessionManager.continueRecent()` loaded stale session history, polluting the fresh conversation context |
| 2 | Raw JSON timeout error in UI | pi `ToolResult` object was passed directly as SSE `output`; no text extraction was performed |

---

## Fixes

### 1. `SessionManager.create()` instead of `continueRecent()`

**File:** `packages/runner-pi/src/pi-runner.ts`

When no explicit `sessionId` (i.e. `--resume`) is provided, the runner now
calls `SessionManager.create(cwd)` which always starts a **brand-new, clean
session**.  Sessions are still persisted to disk so they can be resumed
explicitly with `--resume <sessionId>` in subsequent turns.

```typescript
// Before (loads most-recent session unconditionally):
return SessionManager.continueRecent(cwd);

// After (fresh session unless --resume is passed):
return SessionManager.create(cwd);
```

### 2. `extractToolResultText()` helper

**File:** `packages/runner-pi/src/pi-runner.ts`

A new exported helper `extractToolResultText(result)` unwraps pi's
`{ content: [{type:"text", text:"..."}], details:{} }` format into a plain
string.  The runner now uses this helper when emitting `tool-output-available`
events so the SDK and UI always receive a human-readable string.

```typescript
// Before: raw pi object passed through
yield `...${JSON.stringify({ ..., output: event.result, ... })}...`;

// After: text extracted from pi's content array
const output = extractToolResultText(event.result);
yield `...${JSON.stringify({ ..., output, ... })}...`;
```

The helper:
- Joins all `type:"text"` items in `content[]` with `\n`
- Falls back to `String(result)` / `JSON.stringify(result)` for unknown shapes
- Handles plain strings unchanged

### 3. `SandagentResourceLoader.reload()` before session creation

**File:** `packages/runner-pi/src/pi-runner.ts`

`createAgentSession()` only calls `reload()` when it creates its own
`DefaultResourceLoader`.  When `SandagentResourceLoader` (used for custom
`skillPaths`) was provided, `reload()` was never called, so skills and
extensions on disk were silently ignored.  The runner now explicitly calls
`await resourceLoader.reload()` before passing the loader to
`createAgentSession()`.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/runner-pi/src/pi-runner.ts` | Added `extractToolResultText()`, switched to `SessionManager.create()`, added `reload()` call for custom `SandagentResourceLoader` |
| `packages/runner-pi/src/__tests__/pi-runner.test.ts` | Updated mock tool results to use pi's actual `ToolResult` format; added tests for `extractToolResultText`; added output-format assertion; added `SessionManager.create` to mock |

---

## Testing

Run the `@sandagent/runner-pi` test suite:

```bash
pnpm --filter @sandagent/runner-pi test
```

All 11 tests pass.

---

## Configuration Notes

The model's bash tool `timeout` parameter (in seconds) is passed directly from
the LLM to the subprocess.  There is **no hard cap** in pi by default – the LLM
may specify any value (e.g. `timeout: 300` for a 5-minute `git clone`).  If
long-running commands are timing out unexpectedly, check:

1. Whether the LLM is passing a sensible `timeout` value to the bash tool.
2. Whether the sandbox execution environment imposes its own timeout at the
   `exec()` level.
3. Whether the LiteLLM proxy / model API has a request-level timeout that
   disconnects before the tool finishes.
