# 2026-03-27 - Pi Runner: Segment Assistant Text Parts Around Tools

## Problem

In `@bunny-agent/runner-pi`, all streamed `text-delta` chunks were emitted with a
single `textId` for the whole run. When a response pattern was:

1. assistant text
2. tool call/output
3. assistant text

the UI merged both text phases into one growing text part. This made message
ordering hard to follow and could push the currently relevant text out of view
while tool blocks expanded.

## Root Cause

`packages/runner-pi/src/pi-runner.ts` created one `textId` per run and reused
it for every `text-delta`, regardless of message/tool boundaries.

## Fix

The runner now segments text streams into multiple parts:

- Generates a fresh text part id for each assistant text segment
- Closes active text (`text-end`) before tool execution starts
- Closes active text on `toolcall_start` boundaries
- Starts a new text part on `text_start` events
- Falls back to opening a text part on `text_delta` when `text_start` is absent
- Closes any open text part before emitting final `finish`

This preserves chronological structure in the stream and prevents unrelated
text blocks from being merged.

## Files Changed

- `packages/runner-pi/src/pi-runner.ts`
- `packages/runner-pi/src/__tests__/pi-runner.test.ts`

## Tests

Run:

```bash
pnpm --filter @bunny-agent/runner-pi test
```

Status: passing.
