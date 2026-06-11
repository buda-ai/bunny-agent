# Split env into runtime vs bash channels

**Date:** 2026-06-11
**Branch:** `feat/env-classification`

## Problem

The pi-runner's bash tool inherited nearly the full `env` map from the request — only a small hardcoded `MODEL_AUTH_KEYS` blocklist was filtered out (`packages/runner-pi/src/tool-overrides.ts`, commit 3ca56ff).

That left every other credential reachable from inside bash:

- `BRAVE_API_KEY`, `TAVILY_API_KEY` (web search)
- `IMAGE_GENERATION_MODEL` and any image-gen API keys
- Any caller-defined `*_API_KEY` from a daemon `RunRequest.env`
- Any business secret a CLI user happened to export

A model could exfiltrate these via outbound HTTP from a bash command. The existing redaction layer only scrubs them out of bash stdout text — it does not stop them from being read in the first place.

## Approach

Two independent channels with **no classification logic in the runner**. The caller routes each key explicitly.

```
body.env       → runner runtime (model auth, native tools); never reaches bash
body.systemEnv → bash spawn env (caller's choice)
```

That is the entire design. No allowlist, no blocklist, no prefix matching. The runner does what the caller says. If the caller wants `MY_PRODUCT_TOKEN` in bash, they put it in `systemEnv`. If they want `OPENAI_API_KEY` only inside the runner, they put it in `env`. If they accidentally put it in `systemEnv` — it goes to bash, because bunny-agent is not a policy engine.

### Wire-protocol changes (forward-compatible)

| Surface | Field |
|---------|-------|
| Daemon `RunRequest` | `systemEnv?: Record<string, string>` |
| `BunnyAgentCodingRunBody` | `systemEnv?: Record<string, string>` |
| SDK `BunnyAgentProviderSettings` | `systemEnv?: Record<string, string>` |
| Pi `PiRunnerOptions` | `systemEnv?: Record<string, string>` |
| `RunnerCoreOptions` | `systemEnv?: Record<string, string>` |

All optional. Old daemons ignore the field; old clients don't send it. Both sides keep working — no breaking change.

### CLI fallback

The SDK's CLI fallback path forwards `systemEnv` to runner-cli through `BUNNY_AGENT_SYSTEM_ENV_JSON`. runner-cli reads it on startup, immediately deletes it (so the JSON payload itself doesn't leak via env inheritance), and hands the parsed map to the pi runner. This mirrors the existing `BUNNY_AGENT_TOOL_REFS_JSON` pattern. The CLI argv protocol is unchanged.

There is **no `--system-env` flag**. A user running `bunny-agent run` directly on a workstation already has their shell env in `process.env` — pi's `createBashTool` uses that as the default `ctx.env`, so basic shell utilities keep working. Only callers that programmatically spawn the runner via the SDK need to declare `systemEnv`.

## Compatibility / migration

| Caller | bunny-agent | Behaviour |
|--------|-------------|-----------|
| Old (only `env`) | Old | Unchanged (current leaky behaviour) |
| Old (only `env`) | New | `body.env` no longer reaches bash. **This is the fix.** Any workflow that genuinely needs a key inside bash must update the client to also send `systemEnv`. |
| New (`env` + `systemEnv`) | Old | Old daemon ignores `systemEnv`, runs as before |
| New (`env` + `systemEnv`) | New | `systemEnv` is the bash subset; everything else stays in runner only |

Migration: any caller whose bash scripts read a key like `$MY_PRODUCT_TOKEN` must move that key into `systemEnv`. There is no operational backdoor — that's intentional.

## Critical files

| File | Change |
|------|--------|
| `packages/manager/src/types.ts` | Added `systemEnv` to `BunnyAgentCodingRunBody` |
| `packages/manager/src/env.ts` | Added `systemEnv` to `RunnerEnvParams` |
| `packages/runner-pi/src/tool-overrides.ts` | `buildEnvInjectedBashTool` and `buildSecretAwareTools` accept `BashToolOptions.systemEnv`; bash spawn env is exactly that map. Removed `MODEL_AUTH_KEYS` blocklist, `filterAuthEnvVars`, and all classifier code. |
| `packages/runner-pi/src/pi-runner.ts` | `PiRunnerOptions.systemEnv` plumbed through |
| `packages/runner-harness/src/runner.ts` | `RunnerCoreOptions.systemEnv` plumbed through |
| `apps/daemon/src/routes/coding.ts` | `RunRequest.systemEnv` forwarded to `createRunner` |
| `apps/daemon/src/coding-run-env.ts` | `sanitizeCodingRunBodySystemEnv` |
| `apps/daemon/src/server.ts`, `apps/daemon/src/nextjs.ts` | Sanitise & forward |
| `apps/runner-cli/src/cli.ts` | `takeSystemEnvFromEnv()` reads & deletes `BUNNY_AGENT_SYSTEM_ENV_JSON` on startup |
| `packages/sdk/src/provider/types.ts` | `BunnyAgentProviderSettings.systemEnv` |
| `packages/sdk/src/provider/bunny-agent-provider.ts` | Merges `systemEnv` across default/per-call options |
| `packages/sdk/src/provider/bunny-agent-language-model.ts` | Daemon path forwards `body.systemEnv`; CLI path injects `BUNNY_AGENT_SYSTEM_ENV_JSON` |

## Tests

- `packages/runner-pi/src/__tests__/tool-overrides.test.ts` — kept the redaction suite, added a smoke test for the simplified `buildEnvInjectedBashTool` API.
- `apps/daemon/src/__tests__/coding-run-env.test.ts` (new) — sanitiser/merge for the new field.
- `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r build` all pass.
