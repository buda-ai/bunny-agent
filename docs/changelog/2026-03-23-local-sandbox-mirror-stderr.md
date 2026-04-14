# Session changelog — 2026-03-23 (LocalSandbox stderr)

## Problem

`LocalSandbox` only accumulated child **stderr** and printed it when the command exited with a non-zero code. Successful runs dropped stderr on the floor, so Pi runner logs (`console.error`, e.g. `[bunny-agent:pi]`) never appeared in the Next.js / dev server terminal.

## Fix

- **`packages/manager/src/local-sandbox.ts`:** Mirror each child stderr chunk to `process.stderr` while still buffering for failure handling.
