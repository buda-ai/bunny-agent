# Pi dynamic model endpoint selection

## Request

Prompt caching on our OpenAI-compatible gateway collapsed for the flagship
models: median cache-hit rate was 99.2% for `gpt-6-luna` but 36.7% for
`gpt-6.2-sol`, and 100% of turns were cold for every `claude-*-5-5` route. The
products call the gateway with `openai:<providerModelId>` and `OPENAI_BASE_URL`,
so the request shape is decided entirely inside the Pi runner. Make the runner
stop silently degrading models that are missing from the bundled Pi catalog.

## What went wrong

`createPiRunner` auto-registers any model that `getBuiltinModel()` does not
know under `api: "openai-completions"` with the generic 200k / 64k profile. Two
consequences, both silent:

- The endpoint changes. A vendor rename (Buda renamed `gpt-6.1-sol` to
  `gpt-6.2-sol`, `gpt-6-astra` to `gpt-6.2-astra`) is enough for the pinned
  catalog to miss the id, so a model that previously used `/responses` —
  reasoning items, mid-conversation effort, 272k context, 128k output — starts
  posting to `/chat/completions` with 200k / 64k caps.
- The prompt cache loses its routing hint. Pi's completions client only sends
  `session_id` / `x-client-request-id` / `x-session-affinity` when the provider
  or model opts in, and it only sends `prompt_cache_key` to `api.openai.com`.
  A gateway therefore cannot pin a conversation to the upstream replica that
  already holds its cached prefix, which is exactly the behaviour the Responses
  path gets for free.

## Changes

- `packages/runner-pi/src/pi-runner.ts`
  - Auto-registration now resolves `{ api, profile, compat }` through
    `resolveDynamicModelRegistration()` instead of hardcoding Chat Completions.
  - `DYNAMIC_MODEL_PROFILES` entries can declare `api` and `compat`. Added
    `gpt-6.2-sol` and `gpt-6.2-astra` on `openai-responses` with the GPT-6
    profile (272,000-token context, 128,000-token output, `off: none` thinking
    map, `supportsExplicitPromptCacheMode` / `supportsMidConvoEffort` and the
    other GPT-6 Responses flags).
  - Unknown dynamic models still default to Chat Completions, but now register
    with `sendSessionAffinityHeaders`, so the gateway receives the same
    session-affinity headers the Responses client sends. The format stays
    auto-detected, so OpenRouter models keep `x-session-id`.
  - Added `PI_DYNAMIC_MODEL_API` (`openai-completions` | `openai-responses`) so
    an operator can choose the endpoint for a gateway model without a release.
    Unsupported values are ignored with a warning.
- `packages/runner-pi/src/__tests__/pi-runner.parse-model-spec.test.ts` — covers
  the GPT-6.2 profiles, case-insensitive lookup, the affinity compat on unknown
  models, the env override, and the invalid-value fallback.
- `.env.example` — documents `PI_DYNAMIC_MODEL_API`.

## Validation

- `pnpm --filter "@bunny-agent/runner-pi..." build` (dependencies + runner) and
  `pnpm --filter @bunny-agent/runner-pi test` — 31 files / 438 tests passed.
- `biome check packages/runner-pi` — clean.
- Drove the built runner against a local OpenAI-compatible fake gateway and
  recorded the real requests:

  | model | endpoint | `session_id` | `x-session-affinity` | `prompt_cache_key` | output cap |
  | --- | --- | --- | --- | --- | --- |
  | `gpt-6.2-sol` | `/v1/responses` | yes | n/a | yes | 128,000 |
  | `gpt-6.2-astra` | `/v1/responses` | yes | n/a | yes | 128,000 |
  | unknown, before | `/v1/chat/completions` | no | no | no | — |
  | unknown, after | `/v1/chat/completions` | yes | yes | no (gateway-host only) | — |
  | unknown + `PI_DYNAMIC_MODEL_API=openai-responses` | `/v1/responses` | yes | n/a | yes | 64,000 |

- Not verified: an end-to-end cache-hit improvement against the production
  gateway. That needs a gateway-side run with production credentials; the
  recorded requests show the runner now sends the same affinity key and
  `prompt_cache_key` the high-hit routes already used.
- `claude-*-5-5` routes are unchanged. They stay on Chat Completions and the
  gateway's Anthropic conversion still emits no explicit `cache_control`, so
  that loss lives in the gateway, not here.

## Scope

The Responses endpoint must be supported by the gateway. Only the two GPT-6.2
ids are moved by default; every other unknown model keeps today's endpoint and
gains the affinity headers, which servers that do not understand them ignore.
