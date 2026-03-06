# Pi runner: fix "Cannot set properties of undefined (setting 'baseUrl')"

## Summary

When using the Pi runner with a model spec that `@mariozechner/pi-ai`'s `getModel()` does not support (e.g. `anthropic:claude-opus-4-6-v1`), it could return `undefined`. The code then tried to set `model.baseUrl` in `applyModelOverrides`, causing a fatal error.

## Changes

- **packages/runner-pi/src/pi-runner.ts**
  - In `applyModelOverrides()`: guard with `if (model == null) return` so we never set properties on undefined.
  - After `getModel(provider, modelName)`: if `model` is null/undefined, throw a clear error stating the model spec is unsupported and that supported providers are typically `google` and `openai`.

## Behavior

- Unsupported provider/model combinations (e.g. anthropic with Pi runner) now produce an explicit error message instead of "Cannot set properties of undefined (setting 'baseUrl')".
- For supported models, behavior is unchanged; baseUrl overrides are still applied when env vars are set.
