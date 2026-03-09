---
"@sandagent/runner-pi": patch
"@sandagent/runner-cli": patch
---

feat(runner-pi): auto-register unknown models via base URL env vars

If a model is not found in the built-in pi-ai catalog, automatically
register it using ModelRegistry with the provider's base URL from env
(e.g. OPENAI_BASE_URL for openai:*, ANTHROPIC_BASE_URL for anthropic:*).

This allows using any OpenAI-compatible endpoint with arbitrary model
names like `openai:gemini-3.1-pro` or `anthropic:gemini-3.1-pro`.
