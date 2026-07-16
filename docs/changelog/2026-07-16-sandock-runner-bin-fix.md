# Fix SandockSandbox runner bin path (bunny-agent → bunny-agent-runner)

Date: 2026-07-16

## Why

`SandockSandbox.getRunnerCommand()` (non-`skipBootstrap` path) pointed at
`<workdir>/node_modules/.bin/bunny-agent`, but `@bunny-agent/runner-cli`
publishes its bin as **`bunny-agent-runner`**. Every fresh (non-prebuilt-image)
sandock sandbox failed its first agent run with
`sh: 1: /workspace/node_modules/.bin/bunny-agent: not found`.

The 39 existing unit tests all pass with the bug in place — none asserted the
runner command. It was caught by a live integration run against production
sandock.ai (BunnyAgent end-to-end with a real LLM turn), which now succeeds
(marker echoed in ~29s).

## What Changed

- `packages/sandbox-sandock/src/sandock-sandbox.ts`: `.bin/bunny-agent` →
  `.bin/bunny-agent-runner` in the bootstrap path. The `skipBootstrap` path
  (global `bunny-agent` CLI in the prebuilt image) is unchanged.
- Regression tests for both `getRunnerCommand()` branches.
- `.gitignore`: `.env.integration` (local credentials file used for live
  integration runs).

## Testing

- Unit: 41/41 (2 new regression tests).
- Live: real sandock.ai sandbox — attach → npm bootstrap → real `bunny-agent
  run` (claude runner via LLM proxy) → marker echoed → destroy.
