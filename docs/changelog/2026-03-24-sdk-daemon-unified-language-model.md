# SDK: unify daemon and SandAgent language model (2026-03-24)

## Summary

- **Single implementation**: HTTP daemon transport and in-process `SandAgent` both use `SandAgentLanguageModel`. Only the byte stream source differs (`fetch` vs `agent.stream()`).
- **Same SSE pipeline**: Daemon runners emit AI SDK UI SSE (`data: …`); the previous daemon client incorrectly parsed line-delimited JSON. Parsing now matches the sandbox path.
- **Configuration**: optional `sandbox` when `settings.daemonUrl` is set (HTTP to sandagent-daemon); `DEFAULT_SANDAGENT_DAEMON_URL` is the usual local base.
- **Removed `createSandAgentDaemon`**: use `createSandAgent({ daemonUrl, … })` instead; deleted `sandagent-daemon-provider.ts`.
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
