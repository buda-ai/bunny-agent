# Web Tool Fetch Error Details

Date: 2026-07-18

## Request

Improve `web_search` and `web_fetch` diagnostics so network failures expose the
selected provider and safe nested cause details in both tool output and daemon
stderr. Preserve existing HTTP API error output and do not expose API keys or
request bodies.

## Changes

- Added the selected search provider and safe nested network cause fields to
  `web_search` failures.
- Added the same nested cause diagnostics to `web_fetch` failures and daemon
  stderr, while logging only the destination origin.
- Preserved provider HTTP status and response-body errors, including Tavily
  quota and authentication responses.
- Added coverage for timeout, socket disconnect, and HTTP provider failures.

## Verification

- `runner-pi` typecheck passed.
- All 137 `runner-pi` tests passed on Node.js 24.
- Biome checks passed for the changed TypeScript files.
- A real local socket disconnect produced `UND_ERR_SOCKET` in both the tool
  result and stderr diagnostics.
