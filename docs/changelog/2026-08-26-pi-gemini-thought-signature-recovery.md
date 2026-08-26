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
  `stripLLMThoughtSignaturesFromMessage` removes embedded signatures from the
  outgoing message copy before applying provider ID limits.
- Removed the runner-level SessionManager cleanup path. Saved session files and
  the in-memory session history remain unchanged.
- Added request-time recovery for IDs that are exactly 40 characters long and
  still contain `__thought__`, the shape produced by the faulty truncation
  path.
- Kept outgoing assistant tool-call IDs and matching tool-result IDs
  synchronized and removed the associated `thoughtSignature` field only from
  the request copy.
- Preserved complete signatures for exact same-provider, same-API, and
  same-model replay.
- Added regression coverage proving that cross-model and truncated-signature
  request conversion does not mutate the source history.

## Verification

- `pnpm exec vitest run src/__tests__/pi-ai-thought-signature-patch.test.ts src/__tests__/pi-runner.parse-model-spec.test.ts`
  passed with 19 tests.
- `pnpm test` passed for `packages/runner-pi` with 190 tests.
- `pnpm typecheck` passed for `packages/runner-pi`.
- Biome passed for all changed TypeScript and JSON files.
- `corepack pnpm install --offline --frozen-lockfile` confirmed that the
  dependency patch and minimal lockfile references are reproducible.
