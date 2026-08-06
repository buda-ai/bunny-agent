# Ignore SSE Heartbeat Comments in the SDK

Date: 2026-08-06

## What Changed

- Updated both SDK stream parsing paths to ignore blank lines and SSE comment lines before JSON parsing.
- Added regression coverage for heartbeat comments between normal Pi data events and in the trailing EOF buffer.
- Verified that normal text, `finish`, and `[DONE]` events remain consumable without unparsed-line logs.

## Why

The daemon sends `: heartbeat` SSE comments during long-running operations. The SDK previously treated every non-empty line that did not start with `data: ` as JSON, causing each heartbeat to produce an `Unparsed stream line` debug message for Pi and every other runner using daemon transport.

## Verification

- `pnpm --filter @bunny-agent/manager build`
- `pnpm --filter @bunny-agent/sdk test` passed with 40 tests.
- `pnpm --filter @bunny-agent/sdk typecheck`
- `pnpm --filter @bunny-agent/sdk build`
- `pnpm exec biome check packages/sdk/src/provider/bunny-agent-language-model.ts packages/sdk/src/__tests__/sse-comments.test.ts docs/changelog/2026-08-06-sdk-sse-heartbeat-comments.md`
