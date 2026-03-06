# buildRunnerEnv: differentiate env by runner type

## Summary

`buildRunnerEnv` previously applied Claude-oriented env vars (Anthropic, Bedrock, LiteLLM) for all callers and only added a small Pi-specific block. It now branches by `runnerType` so each runner gets only the vars it needs.

## Changes

- **packages/manager/src/env.ts**
  - **RunnerEnvParams**: Added `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_BASE_URL` for Pi/Codex. Documented which params are for Claude vs Pi.
  - **applyInherit(inherit, env)**: Shared helper that applies filtered `inherit` to `env` (strip null and `STRIP_FROM_CHILD` keys).
  - **applyClaudeRunnerEnv(params, env)**: Claude-only logic (Anthropic API key, base URL, Bedrock, LiteLLM, proxy token). No OpenAI/Gemini vars.
  - **applyPiRunnerEnv(params, env)**: Pi-only logic: `OPENAI_*`, `GEMINI_*`, and Anthropic/Bedrock mapping so Pi can use the Anthropic provider. No Bedrock flags like `CLAUDE_CODE_USE_BEDROCK`.
  - **buildRunnerEnv(params)**: Applies `applyInherit` first, then `switch (runnerType)`: `"pi"` → `applyPiRunnerEnv`, `default` → `applyClaudeRunnerEnv`. `runnerType` defaults to `"claude"` when omitted for backward compatibility.

- **apps/web/lib/example/create-sandbox.ts**
  - Passes `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `GEMINI_BASE_URL` into `buildRunnerEnv` and no longer sets them on `baseEnv` after the call.

## Behavior

- **Claude (and codex/gemini/opencode)**: Same as before; only Claude-related env vars are set.
- **Pi**: Gets OpenAI/Gemini base URLs and keys plus Anthropic proxy mapping; no Claude-specific flags.
- LocalSandbox and other callers that do not pass `runnerType` still get Claude env (default).
