# Pi runner: no fallback for unknown models — fail with clear error

## Summary

The Pi runner uses `@mariozechner/pi-ai`'s `getModel(provider, modelId)`, which only returns models from its built-in catalog. Previously we added a fallback (template model + override id) for unknown ids like `gpt-5.4`. Per product decision, Pi should not support unknown models: if the model is not in the catalog, we throw immediately with a clear error.

## Changes

- **packages/runner-pi/src/pi-runner.ts**
  - Removed `resolveModel()` and `FALLBACK_MODEL_BY_PROVIDER`. Call `getModel(provider, modelName)` directly; if it returns `undefined`, throw with message: unsupported model, use a model from the pi-ai catalog, supported providers typically google/openai.
  - No compatibility fallback for custom model ids.

## Behavior

- Only models present in the pi-ai catalog work (e.g. `openai:gpt-4o`, `google:gemini-2.5-flash-lite-preview-06-17`). Unknown models (e.g. `openai:gpt-5.4`) now fail fast with a clear error instead of using a template.
