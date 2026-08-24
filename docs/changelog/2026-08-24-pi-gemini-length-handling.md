# Preserve Pi length termination for Gemini 3.7 Flash

## Summary

- Use the published Gemini 3.7 Flash context and output limits when Pi dynamically registers the LiteLLM model alias.
- Preserve Pi's `length` stop reason in the AI SDK stream instead of reporting a normal `stop` completion.
- Add focused regression coverage for model capability resolution and length-terminated streams.

## Context

Buda routes `openai:gemini-3.7-flash` through an OpenAI-compatible LiteLLM proxy backed by Vertex AI. Because the alias is not in Pi's built-in model catalog, Bunny previously registered it with generic `128000` context and `8192` output limits. Pi sent that output limit to LiteLLM, causing reasoning-heavy responses to end with `stopReason: "length"` after 8192 generated tokens.

The stream converter then reported every non-error `agent_end` event as `finishReason: "stop"`, so callers could not distinguish truncated output from a complete response.

## Implementation

- Added a dynamic model profile resolver with Gemini 3.7 Flash set to a `1048576` token context window and `65536` maximum output tokens.
- Marked Gemini 3.7 Flash as reasoning-capable even when the caller accepts Vertex's default thinking level instead of specifying an effort.
- Read the final assistant message's Pi stop reason during `agent_end` conversion and map `length` to the AI SDK `length` finish reason.
- Included the raw Pi stop reason as `messageMetadata.providerStopReason` for downstream diagnostics.

## Verification

- Built `@bunny-agent/runner-pi` and its workspace dependencies.
- Ran the complete runner-pi test suite: 15 files and 189 tests passed.
- Ran the runner-pi TypeScript type check successfully.
- Ran Biome checks on all changed TypeScript files successfully.
