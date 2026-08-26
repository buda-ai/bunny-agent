# Pi Gemini thought-signature recovery

## Context

Pi sessions can contain LiteLLM tool-call IDs in the form
`<call-id>__thought__<base64-signature>`. When an OpenAI-compatible session
switches between Gemini model aliases, `@earendil-works/pi-ai` treats the
history as cross-model and truncates tool-call IDs to 40 characters. This can
leave only a prefix of the embedded signature, which Vertex AI rejects while
decoding `thought_signature`.

The upstream `earendil-works/pi` main branch still truncated these IDs without
removing the embedded signature first when checked on 2026-08-26.

## Changes

- Added a pnpm dependency patch for `@earendil-works/pi-ai@0.80.10` so
  cross-model OpenAI-compatible replay removes embedded thought signatures
  before applying provider ID limits.
- Hardened Pi session recovery to remove signatures when the saved assistant
  model differs from the target model.
- Added recovery for IDs that are exactly 40 characters long and still contain
  `__thought__`, the persisted shape produced by the faulty truncation path.
- Kept assistant tool-call IDs and matching tool-result IDs synchronized and
  removed the associated `thoughtSignature` field when repairing history.
- Preserved complete signatures for exact same-provider, same-API, and
  same-model replay.
- Added regression coverage at both the patched dependency boundary and the
  Bunny session-recovery boundary.

## Verification

- `pnpm exec vitest run src/__tests__/pi-ai-thought-signature-patch.test.ts src/__tests__/pi-runner.parse-model-spec.test.ts`
  passed with 22 tests.
- `pnpm test` passed for `packages/runner-pi` with 193 tests.
- `pnpm typecheck` passed for `packages/runner-pi`.
- Biome passed for all changed TypeScript and JSON files.
- `corepack pnpm install --offline --frozen-lockfile` confirmed that the
  dependency patch and minimal lockfile references are reproducible.
