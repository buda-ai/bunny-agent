# Changelog — 2026-03-25 — Pi runner inline API key

## `packages/runner-pi`

- When `options.env` includes the provider’s `*_API_KEY` (e.g. `OPENAI_API_KEY`), the Pi runner:
  - Passes that value as a **literal** to `registerProvider`’s `apiKey` when auto-registering unknown models (Pi’s `resolveConfigValue` treats non-env strings as literals).
  - Calls **`AuthStorage.setRuntimeApiKey`** for the same key so built-in catalog models also authenticate without writing the secret into `process.env`.
- **Removed merging `options.env` into `process.env` during `run()`.** Runner code reads configuration only from the `options.env` object (`getEnvValue`, `applyModelOverrides`, `registerProvider`, `setRuntimeApiKey`). Pi bash subprocesses inherit the host `process.env` only — variables supplied only in a daemon JSON body are not visible to shell tools unless the host already exports them.

If the key is only on the host `process.env` and not in `options.env`, behavior stays: env var **name** is passed to `registerProvider`, and `getEnvValue` still falls back to `process.env` for base URLs and registration.
