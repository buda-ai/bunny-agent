# Remove `x-sandagent-runner-env` / `codingRunDaemonEnv` (2026-03-24)

- **Daemon** `POST /api/coding/run`: runner `env` is **only** the daemon process `process.env` (no header merge).
- **Manager** `streamCodingRunFromSandbox`: no longer sends `x-sandagent-runner-env`; removed `ExecOptions.codingRunDaemonEnv`.
- **SDK** `SandAgentLanguageModel` daemon path: no longer forwards `sandbox.getEnv()` / `createSandAgent({ env })` to the daemon request.
- **apps/web** `/api/daemon/coding-run` proxy: no longer forwards that header.
- Removed `decodeRunnerEnvHeader` / `mergeProcessEnvWithRunnerHeader` from `apps/daemon/src/utils.ts` and deleted `runner-env-header` tests.

Orchestrators should set keys on the **daemon/container environment** (or image) instead of per-request headers.
