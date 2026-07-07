# SDK: serialize full transcript into userInput on fresh sessions

Date: 2026-07-07
Author: zoe-icu
AI Agent: Claude Code (Opus 4.7)

## Summary

When the runtime has no session context to hydrate from (neither `resume`
nor `forkFrom` is set), the SDK now serializes the full conversation
transcript into `userInput` instead of sending only the last user turn.

## What Changed

### `packages/sdk/src/provider/bunny-agent-language-model.ts`

Split the `userInput` construction into two paths controlled by whether the
runtime has session context to hydrate from:

```ts
const hasRuntimeHistory = Boolean(
  this.options.resume ?? this.options.forkFrom,
);
const userInput = hasRuntimeHistory
  ? getLastUserTextFromMessages(messages)
  : serializeMessagesToUserInput(messages);
```

- `resume` — the runner attaches to an existing session file and reads
  prior turns from disk. Only the current user turn should be sent.
- `forkFrom` — the runner snapshot-clones a parent session and continues on
  top of the copied jsonl. Same: only the current user turn.
- Neither set — the runner starts a brand-new session with no server-side
  history. Whatever we put in `userInput` is *all* the runner will see, so
  we serialize the full transcript.

Format produced by `serializeMessagesToUserInput`:

```
Previous conversation:

User: <first user turn>
Assistant: <first assistant turn>

Current message:

<current user turn>
```

- Prior turns labeled by role (`User` / `Assistant` / `System`).
- Consecutive trailing user turns collapse into one "Current message" block
  (matches the existing `getLastUserTextFromMessages` batching semantics).
- Empty-text turns (e.g. image-only assistant messages) are skipped in
  history.

Also extracted `extractTextContent(content)` so both helpers share the
text-part filter and avoid drift.

### `packages/sdk/src/__tests__/get-last-user-text.test.ts`

Kept the existing `getLastUserTextFromMessages` coverage and added a new
`serializeMessagesToUserInput` describe block covering:

- empty input
- current-turn-only (no history)
- consecutive trailing user turns
- history + current pattern
- system turn labeling
- image-only history turns skipped
- text-parts extraction from array content
- history-only (no trailing user turn) — pure summary

## Why

Repro trail:

1. The upstream consumer (buda) sends multiple messages when its stored
   `sandagentSessionId` is `null` — verified from its server log line
   `New session (no sessionId), sending full history: 3 message(s)`.
2. The pi runner jsonl (`2026-07-07T07-38-55-734Z_...jsonl`) captured for
   that request shows only the last user question reaching the runner as
   the first `user` event — no prior turns.
3. The gap is in the SDK: `buildCodingRunBody` populated `userInput` via
   `getLastUserTextFromMessages`, which walks the message array from the
   tail and stops at the first non-user role — silently discarding every
   earlier turn.

That is fine when the runner already has history to hydrate from
(`resume` / `forkFrom` load from a jsonl on the sandbox), but wrong when
it does not: the runner then believes the current question is the very
first turn.

pi's built-in auto-compaction (`agent-session.ts:_checkCompaction`,
`shouldCompact(contextTokens, contextWindow, settings)`, defaults enabled
with `reserveTokens=16384`, `keepRecentTokens=20000`) handles the resulting
larger `userInput` on its own — if the initial prompt exceeds the context
window pi triggers `overflow` compaction and retries once; otherwise the
next `threshold` boundary compacts as usual. No client-side truncation is
required at this layer.

## Files Affected

- `packages/sdk/src/provider/bunny-agent-language-model.ts` — new
  `extractTextContent` + `serializeMessagesToUserInput` helpers; conditional
  `userInput` in `buildCodingRunBody`.
- `packages/sdk/src/__tests__/get-last-user-text.test.ts` — expanded.

## Breaking Changes

None for the `resume` / `forkFrom` path (unchanged). Fresh sessions now
receive a formatted transcript instead of just the last user turn — this is
the intended behavior; the previous behavior was a bug.

## Testing

- `pnpm --filter @bunny-agent/sdk test` — 30/30 pass
- `pnpm run -w lint` — clean (one auto-format applied)
- `pnpm -r typecheck` — all workspace packages green
- `pnpm -r test` — full suite green

**Manual regression (needs runtime):**

1. Continue a shared session against a daemon image that does NOT support
   the fork endpoint (fallback path with `sandagentSessionId = null`). The
   new session should arrive at pi with a `Previous conversation` block
   followed by a `Current message` block.
2. Brand-new session, no share involved — `userInput` should be just the
   user's first message (history block skipped because history is empty).
3. Resume an existing session — payload unchanged, only the new turn sent.

## Follow-up Tasks

- Wire the daemon fork endpoint (currently on `feat/daemon-session-fork`
  in this repo) so the fallback path is only hit for runners that
  genuinely cannot fork.
- If enormous share-continued histories show up in the wild, consider
  clipping to the last N turns upstream (in the consumer) before calling
  the SDK, rather than making the SDK opinionated about truncation.
