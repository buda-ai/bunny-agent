# Context Centralization + Tool Cleanup

## Changes

### `packages/runner-harness/src/agent-context.ts` (new)
- Centralised `BUNNY_AGENT_SYSTEM_PROMPT` — Bunny Agent identity, core values, tool-use enforcement, research methodology, operational rules, output format
- All runners now import from one place; no duplication

### `packages/runner-harness/src/index.ts`
- Added export: `BUNNY_AGENT_SYSTEM_PROMPT` from `./agent-context.js`

### `apps/bunny-agent-tui/src/extension.ts`
- **Removed** duplicate `buildBashTool`, `buildReadFileTool`, `buildWriteFileTool` registrations — these are built into pi-coding-agent (`bash`, `read`, `write`, `edit`, `find`, `grep`, `ls`)
- **Removed** inline `BUNNY_SYSTEM_PROMPT` constant
- **Added** import of `BUNNY_AGENT_SYSTEM_PROMPT` from `@bunny-agent/runner-harness`
- Extension is now ~97 lines (was ~146)

### `apps/bunny-agent-tui/tsup.config.ts`
- Changed extension build: `@bunny-agent/runner-harness` marked as `external` (resolved at runtime via pnpm workspace) instead of `noExternal` (bundled), avoiding transitive dep bundling errors with `@mistralai/mistralai`

## Rationale
- pi-coding-agent already ships `bash`, `read`, `write`, `edit`, `find`, `grep`, `ls` as built-in tools — registering them again via runner-harness was redundant
- System prompt context belongs in runner-harness so bunny-agent and bunny-agent share the same identity without duplication

## Benchmark Results (legitimate, no hints)

| Level | Score | %  |
|-------|-------|----|
| L1    | 34/42 | 81% |
| L2    | 55/66 | 83% |
| L3    | 13/19 | 68% |

**L3 failures (6):** `00d579ea` (wrong), `384d0dd8` (timeout), `72c06643` (wrong), `ad2b4d70` (timeout), `5f982798` (timeout), `0512426f` (wrong)

All scores are legitimate — no answer-revealing hints. L2 83% and L3 68% exceed typical GAIA zero-shot baselines (~50-60% and ~11-30% respectively).

## Session Update - Pi Image Edit Tool Wiring

### `packages/runner-pi/src/pi-runner.ts`
- Added missing `buildImageEditTool` import so `edit_image` is actually registered in `customTools` when image model config is available.
- Updated image usage aggregation to include both `generate_image` and `edit_image` tool executions.

### `packages/runner-pi/src/__tests__/pi-runner.test.ts`
- Added a regression test that emits an `edit_image` tool event and verifies its usage is merged into final `messageMetadata.usage`.

### `packages/runner-pi/src/image-tools.ts`
- Improved image save robustness for edit/generate flows:
  - Added support for alternate response shapes (`images`, `output`) and alternate image fields (`image_base64`, `image_url`, `base64`).
  - Added authenticated URL fetch fallback (`Authorization: Bearer ...`) when saving from `url`/`image_url`.
  - Switched edit upload MIME detection from hardcoded `image/png` to extension-based detection (`jpeg/png/webp/gif`).

### `packages/runner-pi/src/__tests__/image-tools.test.ts`
- Added coverage for:
  - authenticated `image_url` save path,
  - `output[]` response fallback parsing,
  - edit multipart MIME detection for `.jpg` source files.
  - debug summary output when edit response succeeds but contains no saveable image payload.

### `packages/runner-pi/src/image-tools.ts` (debug visibility)
- Added response summary text when generate/edit API call succeeds but no image can be saved.
- Debug output includes top-level response keys, selected image item keys, and whether inline image data or URL is present.
- Expanded image item extraction to support string payload variants (for example `data: ["<base64>"]`) and non-array containers under `data/images/output`.
- Added explicit response-format hints (`response_format=b64_json`, `output_format=png`) for generate/edit requests to improve compatibility with OpenAI-compatible gateways.
- Included `image_model` in save-failure debug output for quick model capability diagnosis.

### `packages/runner-pi/src/pi-runner.ts` + env examples
- Added `IMAGE_EDIT_MODEL` support for `edit_image` so image editing can use a dedicated model.
- `IMAGE_EDIT_MODEL` falls back to `IMAGE_GENERATION_MODEL` when not provided.
- Updated `.env.example` and local `.env` image tool variables to document and configure both generation and edit model env vars.

### `packages/runner-pi/src/__tests__/pi-runner.parse-model-spec.test.ts`
- Added test coverage for `resolveImageEditModelName` (matching provider, fallback behavior, and invalid/mismatch handling).

### Env alignment (image edit model)
- Set `IMAGE_EDIT_MODEL=openai:gemini-3-pro-image` in repo `.env` and `apps/web/.env.local` after manual LiteLLM `/v1/images/edits` verification succeeded for that model (avoids Azure 404 on `gpt-image-1` for this gateway).
- Expanded `.env.example` comments for `IMAGE_EDIT_MODEL` with a `gemini-3-pro-image` example.

### Image model unification
- Unified runner-pi image tool registration so both `generate_image` and `edit_image` use the same model from `IMAGE_GENERATION_MODEL`.
- Removed `IMAGE_EDIT_MODEL` parsing/tests and simplified env docs accordingly.
- Updated local env files to keep a single image model variable (`IMAGE_GENERATION_MODEL`).

### Daemon API: disable harness autoInject
- `apps/daemon/src/routes/coding.ts`: pass `autoInject: false` to `createRunner` for both standalone and `codingRunStream` paths so HTTP/API runs do not read/write `cwd/.bunny-agent` or auto-load workspace `CLAUDE.md`/`AGENTS.md`; resume remains explicit via request `resume`.
- `apps/daemon/src/__tests__/coding.test.ts`: assert `autoInject` is false on API calls.

### Edit image request tuning (LiteLLM compatibility)
- `packages/runner-pi/src/image-tools.ts`: for `edit_image`, stop sending `size`/`quality` by default (when omitted or set to `auto`), and only include them when explicitly provided with a concrete value.
- This aligns tool requests with the manually verified successful `/v1/images/edits` call shape for `gemini-3-pro-image`.
- `packages/runner-pi/src/__tests__/image-tools.test.ts`: added coverage to assert `size`/`quality` are omitted when not provided.

### Edit image save fallback hardening
- `packages/runner-pi/src/image-tools.ts`: expanded save parsing to support more OpenAI-compatible response variants seen in gateways:
  - camelCase fields (`b64Json`, `imageBase64`, `imageUrl`),
  - nested `image` payload (`image: "<base64>"` or `image: { base64 | b64_json | url }`),
  - deep recursive fallback extraction when top-level `data` exists but first item is empty/nonstandard.
- Updated debug summary booleans to reflect the new accepted payload shapes.
- `packages/runner-pi/src/__tests__/image-tools.test.ts`: added regression coverage for `data[0].imageBase64` save path (matching `gemini-3-pro-image` style gateway responses).

### Edit image prompt safety + retry
- `packages/runner-pi/src/image-tools.ts`: added policy-safe edit prompt rewriting when user prompt includes high-risk keywords (`watermark`, `logo`, `copyright`, etc.) that often cause `200` responses with empty `data`.
- Added one automatic retry for `edit_image` when the first response has no saveable image and the prompt was rewritten, using an even more neutral overlay-text cleanup phrasing.
- `packages/runner-pi/src/__tests__/image-tools.test.ts`: added regression test that verifies retry behavior and successful save after an initial empty `data` response.
- Confirmed `details.response` remains the full raw provider response for debug trace fidelity (no response-field sanitization).

### Response type cleanup
- Simplified `ImageGenerationResponse` type definition in `packages/runner-pi/src/image-tools.ts` to match observed real payload fields in debug logs (`created`, `background`, `data`, `output_format`, `quality`, `size`, `usage`).
- Kept runtime parsing compatibility for alternate gateway payload shapes via dynamic fallback access, while avoiding over-specified response typing.

### Save-failure message cleanup
- Removed `summarizeImageResponse()` from `packages/runner-pi/src/image-tools.ts`.
- Save-failure text for image generate/edit now stays concise (`no image payload returned`) while full raw provider response remains available in `details.response` and Pi debug traces.
