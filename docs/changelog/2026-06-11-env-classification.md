# Classify env into system vs agent for bash isolation

**Date:** 2026-06-11
**Branch:** `feat/env-classification`

## Problem

The pi-runner's bash tool accepted every key in `options.env` as a candidate for the bash spawn environment. The only filter was a 9-entry hardcoded `MODEL_AUTH_KEYS` blocklist (`packages/runner-pi/src/tool-overrides.ts`, introduced in commit 3ca56ff).

That left every other credential in the agent's bash environment:

- `BRAVE_API_KEY`, `TAVILY_API_KEY` (web search)
- `IMAGE_GENERATION_MODEL` and any image-gen API keys
- Any caller-defined `*_API_KEY` from a daemon `RunRequest.env`
- User-exported business secrets in CLI mode

A model could exfiltrate these via outbound HTTP from a bash command — the existing redaction layer only scrubs them out of bash stdout text.

## Approach

Promote the secret/non-secret split into an explicit, system-vs-agent classification with three layers of defence and a forward-compatible wire field.

### 1. New protocol field — `systemEnv`

Daemon `RunRequest`, `BunnyAgentCodingRunBody`, and the SDK `BunnyAgentProviderSettings` gain an optional `systemEnv?: Record<string, string>`. Callers that know which keys are safe for bash declare them here. Old callers who don't send the field, and old daemons that don't read it, both keep working — protocol break-free.

### 2. Whitelist-based auto-classifier

`packages/manager/src/env-classifier.ts` exposes:

- `SYSTEM_ENV_KEYS` — POSIX shell, locale, toolchain (PATH, HOME, LANG, TZ, PYTHONPATH, JAVA_HOME, CI, …)
- `SYSTEM_ENV_PREFIXES` — `LC_`, `XDG_`, `BUNNY_`
- `AGENT_ENV_FORCE_DENY` — model auth keys that can never be promoted (defence-in-depth mirror of pi-runner's `MODEL_AUTH_KEYS`)
- `classifyEnv(env, opts)` → `{ system, agent }`
- `parseSystemEnvKeysFromEnv()` — reads `BUNNY_AGENT_SYSTEM_ENV_KEYS` for runtime escape-hatch extension

When a caller does not declare `systemEnv`, pi-runner now classifies `env` via this whitelist instead of the previous "everything except 9 keys" allow-by-default behaviour.

### 3. Three-layer defence

```
┌────────────────────────────────────────────────────────────────┐
│ Layer 1 (protocol):  systemEnv (new)  +  env (existing)         │
│         ↓                                                        │
│ Layer 2 (manager):   classifyEnv() → { system, agent }          │
│         ↓                                                        │
│ Layer 3 (runner-pi):                                            │
│   bash spawn env  ← system only (then stripModelAuth as final)  │
│   redaction set   ← system + agent (full env still scrubbed)    │
│   model/runner    ← agent (model auth, base url)                │
│   native tools    ← agent (web_search reads BRAVE_API_KEY)      │
└────────────────────────────────────────────────────────────────┘
```

`MODEL_AUTH_KEYS` is preserved as a final, unconditional filter — even if a caller misclassifies `ANTHROPIC_API_KEY` into `systemEnv`, it still does not enter bash.

### 4. CLI mode

`apps/runner-cli` adds `--system-env-keys K1,K2,K3`. The flag is merged into the `BUNNY_AGENT_SYSTEM_ENV_KEYS` env var so pi-runner's existing auto-classifier picks it up — no new RunnerSpec field needed.

The same env var is also the **deploy-side escape hatch**: operators can set `BUNNY_AGENT_SYSTEM_ENV_KEYS=K1,K2` on the daemon host to extend the whitelist without redeploying the image.

### 5. Compatibility matrix

| Client | bunny-agent | Behaviour |
|--------|-------------|-----------|
| Old (sends `env`) | Old | Unchanged — current leaky behaviour |
| Old (sends `env`) | New | `env` classified via whitelist; business keys no longer enter bash. **Fix lands.** If a caller relied on a non-whitelist key being in bash, set `BUNNY_AGENT_SYSTEM_ENV_KEYS` |
| New (`env` + `systemEnv`) | Old | Old daemon ignores `systemEnv`, runs as before |
| New (`env` + `systemEnv`) | New | `systemEnv` is the bash subset; everything else stays out |

## Critical files

| File | Change |
|------|--------|
| `packages/manager/src/env-classifier.ts` | New — whitelist, prefixes, `classifyEnv`, force-deny set, `parseSystemEnvKeysFromEnv` |
| `packages/manager/src/env.ts` | Added `systemEnv` to `RunnerEnvParams` |
| `packages/manager/src/types.ts` | Added `systemEnv` to `BunnyAgentCodingRunBody` |
| `packages/manager/src/index.ts` | Re-exports the classifier |
| `packages/runner-pi/src/tool-overrides.ts` | `buildEnvInjectedBashTool` / `buildSecretAwareTools` accept `systemEnv`; new `resolveBashSpawnEnv` is the final gate |
| `packages/runner-pi/src/pi-runner.ts` | `PiRunnerOptions.systemEnv` plumbed into `buildSecretAwareTools` |
| `packages/runner-pi/package.json` | Added workspace dep on `@bunny-agent/manager` |
| `packages/runner-harness/src/runner.ts` | `RunnerCoreOptions.systemEnv` plumbed into `pi` dispatch |
| `apps/daemon/src/routes/coding.ts` | `RunRequest.systemEnv`; forwarded to `createRunner` |
| `apps/daemon/src/coding-run-env.ts` | `sanitizeCodingRunBodySystemEnv` |
| `apps/daemon/src/server.ts`, `apps/daemon/src/nextjs.ts` | Sanitise & forward incoming `systemEnv` |
| `apps/runner-cli/src/cli.ts` | `--system-env-keys` flag → merges into `BUNNY_AGENT_SYSTEM_ENV_KEYS` |
| `packages/sdk/src/provider/types.ts` | `BunnyAgentProviderSettings.systemEnv` |
| `packages/sdk/src/provider/bunny-agent-provider.ts` | Merges `systemEnv` across default/per-call options |
| `packages/sdk/src/provider/bunny-agent-language-model.ts` | Daemon path forwards `body.systemEnv`; CLI path injects `BUNNY_AGENT_SYSTEM_ENV_KEYS` |

## Tests

- `packages/manager/src/__tests__/env-classifier.test.ts` (new) — classifier behaviour, prefix matching, force-deny set, `BUNNY_AGENT_SYSTEM_ENV_KEYS` parsing
- `packages/runner-pi/src/__tests__/tool-overrides.test.ts` — added `resolveBashSpawnEnv` cases: auto-classify, explicit override, `MODEL_AUTH_KEYS` final filter, `BUNNY_AGENT_SYSTEM_ENV_KEYS` extension
- `apps/daemon/src/__tests__/coding-run-env.test.ts` (new) — sanitiser/merge semantics for the new field

`pnpm typecheck`, `pnpm -r test`, and `pnpm -r build` all pass on this branch.

## Migration notes

For most callers the change is transparent. If a workflow relied on a custom env key being visible in bash:

1. Preferred: set `systemEnv` in the request (daemon/SDK) or pass `--system-env-keys` (CLI).
2. Operational fallback: set `BUNNY_AGENT_SYSTEM_ENV_KEYS=K1,K2` on the runner host.

Model auth keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `LITELLM_MASTER_KEY`, `AWS_BEARER_TOKEN_BEDROCK`, the corresponding `*_BASE_URL`s, and `ANTHROPIC_AUTH_TOKEN`) cannot be promoted under any circumstance — that is the whole point.
