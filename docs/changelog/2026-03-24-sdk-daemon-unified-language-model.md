# SandAgent daemon, SDK, web, and tooling (2026-03-24)

Consolidated changelog for daemon transport, manager streaming, web routes, runner env behavior, and agent instructions.

---

## 1. SDK: unify daemon with SandAgent language model

- **Single implementation**: HTTP daemon transport and in-process `SandAgent` both use `SandAgentLanguageModel`. Only the byte stream source differs.
- **Same SSE pipeline**: Daemon runners emit AI SDK UI SSE (`data: …`); the previous daemon client incorrectly parsed line-delimited JSON. Parsing now matches the sandbox path.
- **Configuration**: With `sandbox` + `daemonUrl`, the SDK uses `streamCodingRunFromSandbox` (upload JSON + `curl -N` inside the sandbox, including `LocalSandbox`). `DEFAULT_SANDAGENT_DAEMON_URL` matches the SandAgent Docker image (`http://127.0.0.1:3080` in-container).
- **Removed `createSandAgentDaemon`**: use `createSandAgent({ sandbox, daemonUrl?, … })` instead; deleted `sandagent-daemon-provider.ts`.
- **Removed `SANDAGENT_USE_DAEMON`**: only `daemonUrl` selects daemon transport.
- **Cleanup**: removed trivial `resolveSandAgentDaemonUrl()` (use `settings.daemonUrl`); deduplicated logger into `provider/logging.ts`; removed impossible `getReader()` null check; restored `provider` id `sandagent-daemon` when `daemonUrl` is set.
- **`allowedTools`**: Added to provider settings and merged into `RunnerSpec` (including daemon).
- **Sandbox required**: `createSandAgent` and `doStream` require a `sandbox` adapter; optional `daemonUrl` only selects in-sandbox HTTP vs CLI runner. Removed host-only `fetch(daemonUrl)` path.
- **Small tidy**: `sandagent-language-model.ts` daemon path uses `sandbox.getEnv?.() ?? {}` (same pattern as non-daemon branch).

**Packages:** `packages/sdk/src/provider/types.ts`, `logging.ts`, `sandagent-language-model.ts`, `sandagent-provider.ts`, `index.ts`, `packages/sdk/src/index.ts`.

---

## 2. Manager: `streamCodingRunFromSandbox`

- Run `pnpm --filter @sandagent/manager build` after type changes; `SandboxHandle.runCoding` was removed in favor of `streamCodingRunFromSandbox`.
- `curl` argv is built as a single array before `handle.exec` for readability.

**Package:** `packages/manager/src/coding-run.ts`, `types.ts`, `index.ts`.

---

## 3. Runner environment: `process.env` only (no per-request header)

- **Daemon** `POST /api/coding/run`: runner `env` is only the daemon process `process.env` (no `x-sandagent-runner-env` merge).
- **Manager**: `streamCodingRunFromSandbox` does not send that header; removed `ExecOptions.codingRunDaemonEnv`.
- **SDK** daemon path: does not forward `sandbox.getEnv()` / `createSandAgent({ env })` onto the daemon HTTP request.
- **Daemon utils**: removed `decodeRunnerEnvHeader` / `mergeProcessEnvWithRunnerHeader`; deleted `runner-env-header` tests.
- **Orchestrators** should set API keys on the **daemon/container environment** (or image).

**Paths:** `apps/daemon/src/server.ts`, `nextjs.ts`, `utils.ts`, tests; `packages/manager`, `packages/sdk`, `apps/web/app/api/daemon/coding-run/route.ts`.

---

## 4. Web example app (`apps/web`)

- **`POST /api/ai`**: Passes `daemonUrl: DEFAULT_SANDAGENT_DAEMON_URL` for all adapters; local dev should run `sandagent-daemon` on port 3080 (e.g. `pnpm --filter @sandagent/daemon bundle`).
- **`POST /api/daemon/coding-run`**: Dev/diagnostics proxy (Node runtime) streams the request body to `SANDAGENT_DAEMON_URL` (default `http://127.0.0.1:3080`) `/api/coding/run` and returns the upstream stream. Enabled when `NODE_ENV !== production`; in production requires `SANDAGENT_ENABLE_DAEMON_PROXY=1`.

---

## 5. Daemon package docs and scripts

- Removed `pnpm --filter @sandagent/daemon dev:clean` and `scripts/run-standalone-clean.sh`.
- **README**: Documents that `POST /api/coding/run` uses daemon **`process.env`** for the runner; configure keys on the daemon/container, not via per-request headers from `@sandagent/manager`.

---

## 6. Agent instructions (`AGENTS.md` / `CLAUDE.md`)

- **English in the repository**: code, repo docs, and commit messages stay English.
- **IDE chat**: conversational replies may use the user’s language; committed project files stay English.
