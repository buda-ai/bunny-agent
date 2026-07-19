# Web Search Network Fallback

Date: 2026-07-19

## Request

Keep web search available when the preferred provider cannot be reached from a
user's network.

## Changes

- Treat retryable DNS, connection, timeout, and socket errors as provider
  fallback conditions.
- Try the next configured provider after a retryable network failure.
- Keep authentication and request errors on the selected provider visible
  without masking them through fallback.
- Add coverage for Linux DNS failures and Node.js/Undici connection errors.

## Verification

- Focused web tool tests passed, including DNS, connection timeout, and network
  unreachable fallback cases.
- All 142 `runner-pi` tests passed on Node.js 24.
- `runner-pi` typecheck and Biome checks passed.
- A real local socket disconnect produced `UND_ERR_SOCKET`; the same tool call
  continued with Tavily and returned a successful search result.
