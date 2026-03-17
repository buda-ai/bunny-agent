# Fix CI Build Failures for Multi-Part Image Messages

## Date: 2026-03-17

## Summary

Fixed two TypeScript build errors introduced in the `feat(sdk): support multi-part user messages for image uploads` PR.

## Changes

### `packages/runner-codex/src/codex-runner.ts`

- Imported `Input`, `UserInput` types from `@openai/codex-sdk`.
- Typed `inputToCodex` as `Input` instead of `string | Array<Record<string, unknown>>`.
- Fixed image-part mapping: instead of constructing OpenAI-format `image_url` objects (incompatible with Codex SDK), base64 data URLs are now decoded and written to a temp file, then passed as `{ type: "local_image", path }` which is the correct `UserInput` format for the Codex SDK.
- Non-base64 image URLs (HTTP/HTTPS) are skipped as they are unsupported by the Codex SDK.
- Temp files are cleaned up after the streaming turn completes.

### `packages/sdk/src/provider/sandagent-language-model.ts`

- Fixed `convertPromptToMessages` to use the Vercel AI SDK v3 `LanguageModelV3FilePart` format (`type: 'file'`, `data`, `mediaType`) instead of the old v2 image part format (`type: 'image'`, `part.image`, `part.mimeType`).
- Property accesses updated: `part.image` → `part.data`, `part.mimeType` → `part.mediaType`.
- For `Uint8Array` data, the conversion now produces a proper data URL (`data:<mediaType>;base64,...`).
