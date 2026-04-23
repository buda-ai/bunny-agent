# Sync smoking test: add session resume test (s-009)

**Date:** 2026-04-23

## Summary

Ported the session resume smoking test from the release/0.9.28 branch into
`apps/bunny-bench`, aligning the benchmark dataset with the runner-pi OOM fix
that was already merged.

## Changes

### `apps/bunny-bench/src/types.ts`
- Added `resumePrompt?: string` and `resumeExpectedOutput?: string | RegExp` to
  the `Task` interface to support two-turn tests.

### `apps/bunny-bench/src/datasets.ts`
- Added **s-009 Session resume**: verifies that the agent can recall information
  from a prior turn when resumed with `--resume <sessionId>`.

### `apps/bunny-bench/src/runner.ts`
- `runTask()` now handles two-turn tasks:
  1. Runs the first turn normally.
  2. Extracts `sessionId` from the AI SDK UI stream output.
  3. If the first turn passes and a `resumePrompt` is defined, runs a second
     turn with `--resume <sessionId>` injected into the runner command.
  4. Returns the second turn result as the overall task result.
- Added `extractSessionId()` helper — parses NDJSON stream lines for
  `messageMetadata.sessionId`.
- Added `buildResumeArgs()` helper — inserts `--resume <sessionId>` before the
  prompt, handling both plain (`--print <prompt>`) and `--`-separated
  (`bunny-agent run -- <prompt>`) runner formats.
