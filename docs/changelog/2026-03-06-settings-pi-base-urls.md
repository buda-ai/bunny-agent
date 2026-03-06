# Settings: add OpenAI Base URL and Gemini Base URL for Pi runner

## Summary

The Pi runner uses `OPENAI_BASE_URL` and `GEMINI_BASE_URL` (and already `ANTHROPIC_BASE_URL`) to point to custom API endpoints. The frontend Settings had only `ANTHROPIC_BASE_URL`; the other two could not be configured in the UI.

## Changes

- **apps/web/app/(example)/example/settings/page.tsx**
  - Added "OpenAI Base URL" (`OPENAI_BASE_URL`) under API Keys: optional custom base URL for OpenAI-compatible API (Pi/Codex), e.g. for proxy or LiteLLM.
  - Added "Gemini Base URL" (`GEMINI_BASE_URL`) under API Keys: optional custom base URL for Google Gemini (Pi runner).

- **apps/web/app/api/ai/route.ts**
  - Destructure `OPENAI_BASE_URL` and `GEMINI_BASE_URL` from request body and include them in `sandboxParams`.

- **apps/web/lib/example/create-sandbox.ts**
  - Added `OPENAI_BASE_URL` and `GEMINI_BASE_URL` to `CreateSandboxParams`.
  - In `buildSandbox`, pass them into runner env (`baseEnv`) so the Pi runner subprocess receives them.

## Behavior

- Users can set OpenAI and Gemini base URLs in Settings; values are sent with each request and injected into the runner env so Pi’s `applyModelOverrides()` can set `model.baseUrl` for the chosen provider.
