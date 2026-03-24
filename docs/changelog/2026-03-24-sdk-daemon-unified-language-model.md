# SDK: unify daemon and SandAgent language model (2026-03-24)

## Summary

- **Single implementation**: HTTP daemon transport and in-process `SandAgent` both use `SandAgentLanguageModel`. Only the byte stream source differs (`fetch` vs `agent.stream()`).
- **Same SSE pipeline**: Daemon runners emit AI SDK UI SSE (`data: …`); the previous daemon client incorrectly parsed line-delimited JSON. Parsing now matches the sandbox path.
- **Configuration**: `sandbox` + `daemonUrl` always uses `streamCodingRunFromSandbox` (upload JSON + `curl -N` inside the sandbox, including `LocalSandbox`); `daemonUrl` alone uses host `fetch`. `DEFAULT_SANDAGENT_DAEMON_URL` matches the SandAgent Docker image (`http://127.0.0.1:3080` in-container).
- **Removed `createSandAgentDaemon`**: use `createSandAgent({ sandbox, daemonUrl?, … })` instead; deleted `sandagent-daemon-provider.ts`.
- **Removed `SANDAGENT_USE_DAEMON`**: only `daemonUrl` selects daemon transport.
- **Cleanup**: removed trivial `resolveSandAgentDaemonUrl()` (use `settings.daemonUrl`); deduplicated logger into `provider/logging.ts`; removed impossible `getReader()` null check; restored `provider` id `sandagent-daemon` when `daemonUrl` is set.
- **`allowedTools`**: Added to provider settings and merged into `RunnerSpec` (including daemon).

## Files touched

- `packages/sdk/src/provider/types.ts`
- `packages/sdk/src/provider/logging.ts`
- `packages/sdk/src/provider/sandagent-language-model.ts`
- `packages/sdk/src/provider/sandagent-provider.ts`
- `packages/sdk/src/provider/index.ts`
- `packages/sdk/src/index.ts`

## Web example app (`apps/web`)

- **`POST /api/ai`**: Passes `sandbox` + `daemonUrl: DEFAULT_SANDAGENT_DAEMON_URL` so the SDK hits sandagent-daemon **inside** the E2B/sandbox VM, not the Next.js host.

## `@sandagent/manager` dist

- Run `pnpm --filter @sandagent/manager build` after type changes; `SandboxHandle.runCoding` was removed in favor of always using `streamCodingRunFromSandbox`.

## Sandbox required (`SandAgentLanguageModel`)

- `createSandAgent` and `doStream` require a `sandbox` adapter; optional `daemonUrl` only selects in-sandbox HTTP vs CLI runner. Removed host-only `fetch(daemonUrl)` path.
