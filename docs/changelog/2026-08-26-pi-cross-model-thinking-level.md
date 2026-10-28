# Pi cross-model thinking level recovery

## Context

Pi restores the last thinking level when it resumes a session. A session that
used a non-reasoning model can therefore restore `off` after switching to a
reasoning model. The generic Pi capability clamp promoted `off` to `minimal`
for dynamically registered Gemini 3.7 Flash, but Vertex AI rejects that model
and thinking-level combination.

## Changes

- Declared the supported Gemini 3.7 Flash thinking-level boundary by excluding
  `off`, `minimal`, `xhigh`, and `max` from its dynamic model profile.
- Reset an implicit thinking level to `medium` when a resumed or forked session
  switches models.
- Preserved the existing behavior for same-model resumes and explicit caller
  effort selections.
- Added unit coverage for the Gemini capability map and cross-model thinking
  level selection.

## Verification

- `pnpm exec vitest run src/__tests__/pi-runner.parse-model-spec.test.ts src/__tests__/pi-runner.test.ts` passed with 66 tests.
- `pnpm test` passed for `packages/runner-pi` with 194 tests.
- `pnpm typecheck` passed for `packages/runner-pi`.
- Biome passed for all changed TypeScript files.
