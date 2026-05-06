# generate_image: aspectRatio parameter support for gemini-3-pro-image

**Date:** 2026-05-06

## Problem

Users could not generate 3:4 aspect ratio images using `gemini-3-pro-image` from the chat input box. The `generate_image` tool schema used `additionalProperties: false` and only exposed a `size` enum with pixel-dimension strings. None of the sizes in the enum represented an exact 3:4 ratio, and the schema blocked the AI agent from passing the `aspectRatio` parameter that Gemini image models require.

## Root Cause

Two files defined the `generate_image` tool schema:

- `packages/runner-harness/src/tools/image-generate.ts` (used by claude runner / daemon)
- `packages/runner-pi/src/image-tools.ts` (used by pi runner)

Both had:
1. A `size` enum with no 3:4 ratio sizes (nearest were `1056x1568` ≈ 2:3 and `1088x1472` ≈ 3:4.05 — neither exact)
2. No `aspectRatio` field — so `additionalProperties: false` caused the LLM to never pass it
3. No `aspect_ratio` forwarded in the API request body to the proxy/LiteLLM

When using `gemini-3-pro-image` through an OpenAI-compatible proxy (e.g. LiteLLM), the Gemini Image API requires `aspectRatio` (passed as `aspect_ratio` to the proxy) to control image proportions. Sending only `size` as pixel dimensions does not map to a native Gemini aspect ratio.

## Fix

### `packages/runner-harness/src/tools/image-generate.ts`
- Added `aspectRatio` property to schema with enum `["1:1", "3:4", "4:3", "9:16", "16:9"]`
- Added 3:4 pixel sizes to `size` enum: `768x1024`, `1024x768`, `960x1280`, `1280x960`
- When `aspectRatio` is provided, sends `aspect_ratio` in the API request body
- Updated `promptSnippet` and `promptGuidelines` to mention `aspectRatio`

### `packages/runner-pi/src/image-tools.ts`
- Same schema additions and API body changes as above

### `packages/runner-pi/src/__tests__/image-tools.test.ts`
- Added test: sends `aspect_ratio` in request body when `aspectRatio` param is provided
- Added test: does NOT send `aspect_ratio` when `aspectRatio` is absent

## Usage

To generate a 3:4 portrait image with `gemini-3-pro-image`, the agent now calls:

```json
{
  "prompt": "a beautiful landscape",
  "filename": "landscape.png",
  "aspectRatio": "3:4"
}
```

This sends `aspect_ratio: "3:4"` to the proxy, which forwards it to the Gemini Image API.
