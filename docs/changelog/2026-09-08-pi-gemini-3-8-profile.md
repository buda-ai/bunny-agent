# Pi Gemini 3.8 Dynamic Model Profile

## Changes

- Added a `gemini-3.8-flash` dynamic model profile to runner-pi with the same
  1,048,576-token context window, 65,536-token output limit, reasoning support,
  and thinking-level compatibility map as `gemini-3.7-flash`.
- Added regression coverage proving both Gemini Flash profiles remain identical,
  model lookup remains case-insensitive, and unknown dynamic models retain the
  existing 128,000-token context and 8,192-token output fallback.

## Why

Without an explicit profile, an OpenAI-compatible gateway route for Gemini 3.8
was treated as an unknown dynamic model and restricted to the generic 8,192-token
output limit. Long-running agent tasks could therefore terminate before the
model's supported output capacity was reached.

## Verification

- `pnpm --filter @bunny-agent/runner-pi exec vitest run src/__tests__/pi-runner.parse-model-spec.test.ts`
- `pnpm --filter @bunny-agent/runner-pi typecheck`
- `pnpm exec biome check packages/runner-pi/src/pi-runner.ts packages/runner-pi/src/__tests__/pi-runner.parse-model-spec.test.ts`
