# Fix Pi Runner Compaction Continuation

## Summary

- Diagnosed Pi runner sessions that stopped after a context-window overflow instead of compacting and continuing.
- Identified that the runner finalized its AI SDK stream on the first low-level `agent_end` event, before `session.prompt()` completed Pi's overflow recovery flow.

## Changes

- Deferred final stream completion until the full Pi prompt, including automatic compaction and continuation, has settled.
- Buffered intermediate `agent_end` events and finalized the stream from the last event only.
- Added regression coverage for overflow recovery continuing successfully without exposing the intermediate context-window error, while preserving terminal model errors.

## Verification

- `pnpm --filter @bunny-agent/runner-pi test` (`132` tests passed)
- `pnpm --filter @bunny-agent/runner-pi typecheck`
- `pnpm --filter @bunny-agent/runner-pi build`
- `pnpm exec biome check packages/runner-pi/src/pi-runner.ts packages/runner-pi/src/__tests__/pi-runner.test.ts docs/changelog/2026-07-13-pi-runner-compaction-continuation.md`
- `git diff --check`
