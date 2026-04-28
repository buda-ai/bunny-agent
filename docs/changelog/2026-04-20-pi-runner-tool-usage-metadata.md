# Changelog — 2026-04-20 — Pi runner tool usage metadata

## Pi runner (`packages/runner-pi`)

- On each assistant `message_end`, capture Pi’s `usage` for that LLM completion (the turn that produced tool calls).
- Emit that usage on `tool-input-start`, `tool-input-available`, and `tool-output-available` as `messageMetadata.usage` (same token field names as the final `finish` event: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`).
- Emit **`messageMetadata.cost`** (USD) on those tool events and on `finish` by applying Pi’s **`calculateCost`** to the resolved chat **`Model`** (`Model.cost` is price per 1M tokens from the Pi catalog). Unknown / auto-registered models with zero rates yield no `cost` field.
- Emit **`messageMetadata.model`** as `{ provider, modelId }` so gateways can reconcile against their own price lists.
- For `generate_image` / `edit_image` tool results, keep `messageMetadata.imageGenerationUsage` (tokens); when `IMAGE_GENERATION_MODEL` resolves to a priced catalog model, also emit **`messageMetadata.imageCost`** and **`imageModel`** on `tool-output-available`, and **`imageCost` / `imageModel`** on `finish` (LLM **`cost`** on `finish` is for the last assistant completion only; image is separate).
- Refactored billing metadata composition to dedicated helpers (`buildImageMetadata`, `buildImageCostFromTokenTally`, `mergeMetadata`, `buildFinishUsageMetadata`) so event handling remains declarative and avoids duplicated metadata branching.
- Updated `finish` usage/cost baseline to sum all assistant message usages from `agent_end.messages` (multi-turn), instead of only the last assistant usage.
- Added backward-compatible `messageMetadata.models` in `finish`:
  - `chat` entry includes `{ provider, modelId, usage, cost? }`
  - `image` entry includes `{ provider, modelId, usage, cost? }` when image usage/model is available
  - Existing fields (`usage`, `model`, `cost`, `imageModel`, `imageCost`) remain unchanged for compatibility.
- Moved usage/billing/model-summary computation from `pi-runner.ts` into a dedicated module `packages/runner-pi/src/usage-metadata.ts`; `pi-runner.ts` now focuses on stream/event orchestration.
- Extracted Pi event-to-AI-SDK stream conversion into `packages/runner-pi/src/stream-converter.ts` (`PiAISDKStreamConverter`) so `pi-runner.ts` only manages session lifecycle, queueing, and prompt orchestration.
- Reverted `streamSessionToSSE(...)` extraction in `pi-runner.ts` and kept session streaming logic inline in `run()` for easier local navigation/debugging.
- Updated image billing attribution: `imagePricingModel` now prefers `IMAGE_GENERATION_MODEL` resolution (catalog/modelRegistry), and falls back to the user-selected `model` if image model resolution is unavailable.
- Moved `extractToolResultText` from `pi-runner.ts` to `stream-converter.ts` to keep stream conversion helpers colocated with stream conversion logic.
- Simplified text-part parsing in `stream-converter.ts` by using a single `activeTextPartId` state and an `emitTextDelta(...)` helper (same SSE output semantics, less branching).
- Consolidated stream conversion implementation into `stream-converter.ts` and removed `stream-convert.ts` to avoid duplicate file names and alias indirection.
- Added web search billing metadata plumbing: `web_search` now emits `details.billing` (provider, requests, fetched pages) without requiring user-provided pricing env vars, and the stream converter maps it to `messageMetadata.webSearchUsage/webSearchProvider` (plus `webSearchCost` only when upstream billing cost exists) on tool output and finish totals.
- Added usage logging in `apps/web/app/api/ai/route.ts`: `streamText` now logs `finishReason`, `usage`, `totalUsage`, `responseId`, and step count in `onFinish`, making backend usage inspection easier during local debugging.
- Added `web_search` unit coverage in `packages/runner-pi/src/__tests__/web-tools.test.ts` based on real debug payload shape: verifies tool output includes `details.billing` with `{ type, providerId, requests, fetchedPages }` and formatted Brave result text.
- Added SDK usage extraction helpers in `packages/sdk/src/provider/usage.ts`: `getBunnyAgentMetadata(providerMetadata)` and `getBunnyAgentUsage(providerMetadata)` so app code can read Bunny Agent usage/session metadata without re-implementing stream/providerMetadata parsing.
- Updated `getBunnyAgentUsage(providerMetadata)` to return AI SDK-standard usage shape (`inputTokens`, `outputTokens`, `raw`) instead of raw snake_case token fields.
- Centralized usage normalization logic in `packages/sdk/src/provider/usage.ts` and reused it in `bunny-agent-language-model.ts`, so stream parsing and helper extraction share one conversion path; `raw` now preserves non-usage metadata fields (e.g. model/image/search metadata) alongside usage tokens.
- Removed cost-oriented metadata from Pi runner output (`cost`, `imageCost`, `webSearchCost`, and `models[*].cost`) to keep metadata focused on usage/model/session fields only.
- Extended `web_search` tool result details with `providerResponse` (raw provider payload) so callers can inspect provider-returned fields, including any provider-specific charging/quota metadata when present.
- Aligned web search metadata shape for easier consumption: removed unused `costUsd`, standardized usage as `webSearchUsage.{requests,fetchedPages}` (camelCase), and included `webSearchProvider` in finish metadata aggregation.
- Improved finish-level web search accounting for multi-provider runs: totals are still emitted in `webSearchUsage`, and a per-provider breakdown is now emitted as `webSearchUsageByProvider`.
- Added a reusable exported runner-pi type `ToolDetailsWithUsage<TUsage, TExtra>` (`packages/runner-pi/src/tool-details.ts`) for standardizing `details.usage` payloads across tools; `web_search` billing details now include `usage` in this common shape.
- Image tools (`generate_image` / `edit_image`): when the API returns usage, `details.usage.raw[imageModelId]` holds the same usage object (flat token fields under the model id — no `raw[modelId].usage` wrapper). `getImageUsageFromToolResult` prefers a single-key `raw` map, else falls back to `details.response.usage`.
- `web_search` tool results expose only `details.usage: { raw }` (provider id → counts). `getWebSearchBillingFromToolResult` synthesises `{ type, providerId, requests, fetchedPages }` from a single-provider `raw` map for stream metadata.
- Unified metadata helpers in `usage-metadata.ts`: exported `MessageMetadata` with a documented field contract; `mergeMetadata` / builders use that type; **`webSearchUsage`** and **`imageUsage`** on SSE `messageMetadata` reuse the same shapes as tools — **`WebSearchUsageDetails`** and **`ImageToolUsageDetails`** (`{ raw: { … } }`), not separate flattened usage objects; finish web-search totals use the same `webSearchUsage.raw` map (aggregated per provider). **`buildImageMetadata(toolName, result, imagePricingModel)`** prefers `details.usage` from the tool result, else synthesizes `raw` from extracted usage + catalog model id.
- Introduced generic **`ToolUsageDetails<T>`** (`packages/runner-pi/src/tool-details.ts`) with **`raw: Record<string, T>`**; **`WebSearchUsageDetails`** extends **`ToolUsageDetails<WebSearchProviderUsage>`**; **`ImageToolUsageDetails`** extends **`ToolUsageDetails<ImageGenerationUsage>`**. Exported **`ToolUsageDetails`** and **`WebSearchProviderUsage`** from `@bunny-agent/runner-pi`.
- **`ToolDetailsWithUsage<TRow, TExtra>`** now types **`usage`** as **`ToolUsageDetails<TRow>`** (always includes `raw`), not an unconstrained `TUsage`. **`ImageToolDetails`** is a **`ToolDetailsWithUsage<ImageGenerationUsage, { filePath, response }>`** alias.
- Removed unused **`ToolUsageRecord`** export (nothing referenced it after `ToolUsageDetails` / `ToolDetailsWithUsage` refactors).

## SDK (`packages/sdk`)

- When parsing the AI SDK UI stream, map runner `messageMetadata` on tool-related SSE events to `providerMetadata["bunny-agent"]` (including `sessionId`) for `tool-input-start`, `tool-call` (from `tool-input-available`), and `tool-result` (from `tool-output-available`), so callers using the language model bridge can bill per tool round (`usage`, `cost`, `model`, and image fields when present).
