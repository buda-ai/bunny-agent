# Pi default token limits

## Request

Raise the Pi runner's fallback model defaults to a 200,000-token context
window and a 64,000-token maximum output budget. The caller confirmed gateway
support for these limits.

## Changes

- Updated the model auto-registration defaults from 128,000 / 8,192 to
  200,000 / 64,000 tokens.
- Built-in model definitions and the request protocol remain unchanged.
- Pi's context window is a shared context budget, not a separate guarantee of
  200,000 input tokens plus 64,000 output tokens.

## Validation

- Installed the runner and its workspace dependencies with the frozen lockfile;
  built the manager and apply-patch packages.
- Scoped runner-pi typecheck, build, and Biome check passed.
- All 184 tests across 15 runner-pi test files passed, including the real MCP
  adapter integration test.
- Ran the built runner with the real installed Pi runtime and a local HTTP
  response fixture. An unknown model registered with contextWindow=200000 and
  maxTokens=64000, sent a Chat Completions request with a 64000-token output
  limit, and streamed the fixture reply successfully.
- Partially verified: no production gateway, long-context model quality, or
  deployment validation was performed.

## Scope

This does not change image persistence, oversized-session recovery, or deployed
runner installations.
