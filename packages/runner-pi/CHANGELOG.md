# @sandagent/runner-pi

## 0.6.3

### Patch Changes

- e449d60: feat(runner-pi): auto-register unknown models via base URL env vars

  If a model is not found in the built-in pi-ai catalog, automatically
  register it using ModelRegistry with the provider's base URL from env
  (e.g. OPENAI_BASE_URL for openai:_, ANTHROPIC_BASE_URL for anthropic:_).

  This allows using any OpenAI-compatible endpoint with arbitrary model
  names like `openai:gemini-3.1-pro` or `anthropic:gemini-3.1-pro`.

- 9ef04e7: chore: trigger release

## 0.6.0

### Minor Changes

- 5086df7: Bump to v0.5.1 beta release
