# Session changelog — daemon healthz probe and CLI fallback

## Summary

- **`@sandagent/manager`**: Added `isSandagentDaemonHealthy` (internal healthz URL; not exported). Probe uses curl `-w '%{http_code}'` and succeeds only on **HTTP 200** (`--connect-timeout` / `--max-time`, default ~4s, single attempt unless overridden).
- **`@sandagent/sdk`**: If `daemonUrl` is configured, streams use `streamCodingRunFromSandbox` (no built-in `/healthz`); apps call `isSandagentDaemonHealthy` when they want probes or CLI fallback.
- **`@sandagent/sandbox-sandock`**: Removed `daemon-health.ts`, attach-time `waitForSandagentDaemonIfConfigured`, and options `readinessProbeBaseUrl`, `readinessProbeMaxWaitMs`, and `daemonUrl` (plus `getDaemonBaseUrl`, `getRunnerTransport`, `attachIncludesDaemonHealthWait`).
- **`apps/web`**: Sandock sandbox creation no longer passes removed options; comments updated for `USE_SANDAGENT_DAEMON` / `useSandagentDaemon`.

## Follow-up

- **`packages/manager/src/daemon-health.ts`**: JSDoc no longer uses `{@link SandboxHandle.exec}` (TypeScript treated the interface as a value). **`daemon-health.test.ts`**: cases for HTTP 500, curl `000` (unreachable), synchronous `exec` throw (missing binary), and iterator rejection on first read.

- **`@sandagent/sdk`**: `daemonUrl` no longer runs `/healthz` inside `doStream`. Re-export **`isSandagentDaemonHealthy`** / **`IsSandagentDaemonHealthyOptions`** from `@sandagent/sdk` for app-level probes. **`apps/web` `/api/ai`**: when `USE_SANDAGENT_DAEMON`, probes health once per request before passing `daemonUrl` (same CLI fallback behavior as before for the example app).
