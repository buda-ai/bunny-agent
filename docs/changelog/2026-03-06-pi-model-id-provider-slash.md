# Pi runner: fix MODEL_ID provider (slash format and bare model name)

## Summary

When using the Pi runner, the API was sometimes forcing the provider to `anthropic`: e.g. `openai/gpt-5.4` became `anthropic:openai/gpt-5.4`, and bare `gpt-5.4` became `anthropic:gpt-5.4`, causing "unsupported model" from Pi. The provider must be derived from the model id or name.

## Changes

- **apps/web/app/api/ai/route.ts**
  - For Pi runner, when building the `provider:model` string:
    - If `MODEL_ID` already contains `:` (e.g. `google:gemini-2.5-pro`), use as-is.
    - If it starts with `global.anthropic.`, convert to `anthropic:<rest>`.
    - If it contains `/` (e.g. `openai/gpt-5.4`), treat as `provider/modelName` and convert to `provider:modelName` (e.g. `openai:gpt-5.4`).
    - If it has no `:` and no `/`, infer provider from the model name: `gpt-*`, `o1-*`, `o3-*` → openai; `claude-*` → anthropic; `gemini-*` → google; otherwise default to openai. So `gpt-5.4` becomes `openai:gpt-5.4`, not `anthropic:gpt-5.4`.

## Behavior

- `MODEL_ID: "openai/gpt-5.4"` or `MODEL_ID: "gpt-5.4"` with Pi runner now becomes `openai:gpt-5.4`.
- `claude-opus-4-6-v1` becomes `anthropic:claude-opus-4-6-v1`. Other forms are handled so the provider matches the model.
