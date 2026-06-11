# Split env channels for daemon mode bash isolation

**Date:** 2026-06-11
**Branch:** `feat/env-classification`

## Problem

The pi-runner's bash tool inherited nearly the full `env` map from the request — only a small hardcoded `MODEL_AUTH_KEYS` blocklist was filtered out (commit 3ca56ff). That let every other credential reach bash:

- `BRAVE_API_KEY`, `TAVILY_API_KEY` (web search)
- `IMAGE_GENERATION_MODEL`
- Any caller-defined `*_API_KEY` from a daemon `RunRequest.env`

In the **daemon scenario** (long-lived process, many requests, possibly many tenants), this is a real leak: a model can exfiltrate any of those keys via outbound HTTP. Redaction only scrubs bash stdout — it does not stop reads.

## Approach

Two independent channels, routed by the caller:

```
body.env       → runner runtime (model auth, native tools, image-gen, web_search)
body.systemEnv → bash spawn env (caller's choice of what bash should see)
```

The runner has no policy. No allowlist, no blocklist, no prefix matching, no force-deny set. Each project's "system vs business" line lives in the caller's code.

### Daemon mode (the scenario this PR fixes)

`body.env` populates the runner's runtime config. `body.systemEnv` is forwarded into pi's `createBashTool` via `spawnHook`, on top of the bash tool's default `ctx.env`. Anything not in `systemEnv` stays out of bash.

### CLI mode (`bunny-agent run` direct, or SDK CLI fallback)

Each invocation is single-request / single-tenant — there is no tenant-mixing risk, and the runner's `process.env` *is* the expected bash environment. So `env` and `systemEnv` are simply merged and passed via the standard `sandbox.exec({ env })` path; pi's bash tool inherits everything via its default `ctx.env`. No special JSON-payload channel for systemEnv. The CLI argv protocol is unchanged.

The existing `BUNNY_AGENT_TOOL_REFS_JSON` mechanism is unchanged — toolRefs really cannot reach bash because they may contain Bearer tokens.

## Wire protocol (forward-compatible)

| Surface | New field |
|---------|-----------|
| Daemon `RunRequest` | `systemEnv?: Record<string, string>` |
| `BunnyAgentCodingRunBody` | `systemEnv?: Record<string, string>` |
| SDK `BunnyAgentProviderSettings` | `systemEnv?: Record<string, string>` |
| Pi `PiRunnerOptions` | `systemEnv?: Record<string, string>` |
| Harness `RunnerCoreOptions` | `systemEnv?: Record<string, string>` |

All optional. Old daemons ignore the field; old clients don't send it. Either side can be upgraded first.

## Compatibility / migration

| Caller | bunny-agent | Behaviour |
|--------|-------------|-----------|
| Old (only `env`) | Old | Unchanged (current leaky behaviour) |
| Old (only `env`) | New (daemon) | `body.env` no longer reaches bash. **This is the fix.** Workflows that need a key in bash must update the client to send `systemEnv`. |
| Old (only `env`) | New (CLI) | Unchanged — env still merged into sandbox.exec, bash sees everything (intentional in CLI mode). |
| New (`env` + `systemEnv`) | Old | Old daemon ignores `systemEnv`, runs as before |
| New (`env` + `systemEnv`) | New | Daemon: `systemEnv` is the bash subset. CLI: env+systemEnv merged. |

## Critical files

| File | Change |
|------|--------|
| `packages/runner-pi/src/tool-overrides.ts` | `buildEnvInjectedBashTool` accepts `BashToolOptions.systemEnv`; bash spawn env = caller's `systemEnv` (or empty). Removed `MODEL_AUTH_KEYS`, `filterAuthEnvVars`, classifier code. |
| `packages/runner-pi/src/pi-runner.ts` | `PiRunnerOptions.systemEnv` plumbed through |
| `packages/runner-harness/src/runner.ts` | `RunnerCoreOptions.systemEnv` plumbed to pi runner |
| `apps/daemon/src/routes/coding.ts` | `RunRequest.systemEnv` forwarded |
| `apps/daemon/src/coding-run-env.ts` | `sanitizeCodingRunBodySystemEnv` |
| `apps/daemon/src/server.ts`, `apps/daemon/src/nextjs.ts` | Sanitise & forward |
| `apps/runner-cli/src/env-payload.ts` | Extracted `takeToolRefsFromEnv` for direct testing (unchanged behaviour). No systemEnv-specific helper — CLI mode merges env+systemEnv via sandbox.exec. |
| `apps/runner-cli/src/cli.ts` | Imports the helper |
| `packages/sdk/src/provider/types.ts` | `BunnyAgentProviderSettings.systemEnv` |
| `packages/sdk/src/provider/bunny-agent-provider.ts` | Merges `systemEnv` across default/per-call options |
| `packages/sdk/src/provider/bunny-agent-language-model.ts` | Daemon path forwards `body.systemEnv`; CLI path merges env+systemEnv into `sandbox.exec({ env })` |

## Tests

- `packages/runner-pi/src/__tests__/tool-overrides.test.ts` — kept full redaction suite. Added 5 spawnHook behaviour tests via `vi.mock` of `createBashTool`: empty systemEnv → only ctx.env; explicit systemEnv → exactly those keys; "no policy" pin (caller can put auth keys in systemEnv if they really want); ctx.env preserved; systemEnv overrides on collision.
- `apps/runner-cli/src/__tests__/env-payload.test.ts` (new) — `takeToolRefsFromEnv` read-and-unset semantics, malformed-JSON unset, one-shot behaviour.
- `apps/daemon/src/__tests__/coding-run-env.test.ts` (new) — sanitiser/merge for the new field.
- `pnpm -r typecheck` / `pnpm -r test` / `pnpm -r build` — green on this branch.

## Recommended pattern

In **daemon deployments**, route credentials by purpose:

```ts
// SDK
createBunnyAgent({
  sandbox,
  daemonUrl,
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,    // model auth
    BRAVE_API_KEY: process.env.BRAVE_API_KEY,            // web_search
    IMAGE_GENERATION_MODEL: "openai:gpt-image-1",        // image-gen
  },
  systemEnv: {
    // only what bash genuinely needs — typically nothing or a
    // narrow allowlist of OS-level variables you want to override.
  },
});
```

Anything missing from `systemEnv` does not reach bash, even if it's in `env`.
