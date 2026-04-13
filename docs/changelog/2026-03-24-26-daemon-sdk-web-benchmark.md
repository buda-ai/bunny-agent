# Daemon, SDK, web example, and benchmark (2026-03-24–26)

Consolidated session notes (merges former `2026-03-24-sdk-daemon-unified-language-model.md`, `2026-03-24-daemon-error-resilience.md`, and `2026-03-26-fix-daemon-branch.md`).

---

## Daemon HTTP crash resilience (`apps/daemon`)

**Problem:** A malformed request (e.g. multipart posted to a JSON-only route) could trigger unhandled `JSON.parse` / `SyntaxError` and crash the Node process.

**Changes (`server.ts`):**

1. Top-level try-catch around the `http.createServer` callback — unhandled errors return 500 JSON instead of exiting.
2. Safe JSON parsing via `safeJsonParse()` — `AppError(400)` with a readable message.
3. Content-type guard on non-upload POST routes — `multipart/form-data` or `application/x-www-form-urlencoded` on JSON-only endpoints → 400.
4. `sendJson()` helper for JSON responses.

**Changes (`cli.ts`):** `uncaughtException` and `unhandledRejection` handlers log and keep the server running.

---

## SDK: unified daemon with Bunny Agent language model

- **Single implementation**: HTTP daemon transport and in-process `Bunny Agent` both use `Bunny AgentLanguageModel`; only the byte stream source differs.
- **Same SSE pipeline**: Daemon runners emit AI SDK UI SSE (`data: …`); parsing matches the sandbox path (not line-delimited JSON).
- **Configuration**: With `sandbox` + `daemonUrl`, the SDK uses `streamCodingRunFromSandbox` (upload JSON + `curl -N` inside the sandbox, including `LocalSandbox`). `DEFAULT_BUNNY_AGENT_DAEMON_URL` matches the Bunny Agent Docker image (`http://127.0.0.1:3080` in-container).
- **API**: Use `createBunny Agent({ sandbox, daemonUrl?, … })` (legacy `createBunny AgentDaemon` removed; `bunny-agent-daemon-provider.ts` removed).
- **`allowedTools`**: On provider settings, merged into `RunnerSpec` (including daemon).
- **Sandbox required**: `createBunny Agent` / `doStream` require a `sandbox` adapter; optional `daemonUrl` selects in-sandbox HTTP vs CLI runner (no host-only `fetch(daemonUrl)` path).

**Packages:** `packages/sdk/src/provider/types.ts`, `logging.ts`, `bunny-agent-language-model.ts`, `bunny-agent-provider.ts`, `index.ts`.

---

## Manager: `streamCodingRunFromSandbox` and daemon health

- `SandboxHandle.runCoding` removed in favor of `streamCodingRunFromSandbox`; `curl` argv built as a single array before `handle.exec`.
- **`isSandagentDaemonHealthy`**: Probes `<base>/healthz` via `SandboxHandle.exec` and curl `-w '%{http_code}'` (true only on **200**; connect/max-time caps; default single attempt ~4s). Re-exported from **`@bunny-agent/sdk`**. Unit tests cover non-200, `000`, empty output, sync `exec` throw, and iterator rejection.
- **With `daemonUrl`**, streams use `streamCodingRunFromSandbox` only — **no** automatic `/healthz` on each request; apps call `isSandagentDaemonHealthy` when they want readiness checks or CLI fallback.

**Paths:** `packages/manager/src/coding-run.ts`, `daemon-health.ts`, `types.ts`, `index.ts`.

---

## Runner environment: daemon uses `process.env` only (no per-request header)

- **Daemon** `POST /api/coding/run`: runner `env` is only the daemon process `process.env` (no `x-bunny-agent-runner-env` merge).
- **Manager**: `streamCodingRunFromSandbox` does not send that header; removed `ExecOptions.codingRunDaemonEnv`.
- **SDK** daemon path: does not forward `sandbox.getEnv()` / `createBunny Agent({ env })` onto the daemon HTTP request.
- **Daemon utils**: removed `decodeRunnerEnvHeader` / `mergeProcessEnvWithRunnerHeader`; related tests removed.
- Orchestrators should set API keys on the **daemon/container environment** (or image).

**Paths:** `apps/daemon/src/server.ts`, `nextjs.ts`, `utils.ts`, tests; `packages/manager`, `packages/sdk`, `apps/web/app/api/daemon/coding-run/route.ts`.

---

## `@bunny-agent/sandbox-sandock`

Removed attach-time daemon readiness (`daemon-health.ts`, `waitForSandagentDaemonIfConfigured`, related options and helpers).

---

## Web example (`apps/web`)

- **`POST /api/ai`**: When `USE_BUNNY_AGENT_DAEMON` is enabled (body `"1"`/`"true"` or env `BUNNY_AGENT_USE_DAEMON=1`), probes in-sandbox health then passes `daemonUrl: DEFAULT_BUNNY_AGENT_DAEMON_URL`. **`useSandagentDaemon`** is passed for **all** sandbox providers so cache keys match daemon vs CLI mode.
- **Settings**: **Use Bunny Agent daemon** toggle (`USE_BUNNY_AGENT_DAEMON`); redundant **Daemon URL** (`DAEMON_URL`) removed from the example UI (fixed in-sandbox URL only).
- **`POST /api/daemon/coding-run`**: Dev proxy streams the body to `BUNNY_AGENT_DAEMON_URL` (default `http://127.0.0.1:3080`) `/api/coding/run`. Enabled when `NODE_ENV !== production`; in production requires `BUNNY_AGENT_ENABLE_DAEMON_PROXY=1`.

---

## Daemon package docs and scripts

- Removed `pnpm --filter @bunny-agent/daemon dev:clean` and `scripts/run-standalone-clean.sh`.
- **README**: Documents `POST /api/coding/run` uses daemon **`process.env`** for the runner.

---

## Agent instructions (`AGENTS.md` / `CLAUDE.md`)

- **English in the repository**: code, repo docs, and commit messages stay English.
- **IDE chat**: conversational replies may use the user’s language; committed project files stay English.

---

## benchmark-bunny-agent smoking

- **`run`**: `--transport cli|daemon` (default `cli`), optional `--daemon-url`. `daemon` uses `buildRunnerEnv` + `streamCodingRunFromSandbox` to in-container daemon (default `http://127.0.0.1:3080`). `--transport sandock` is a deprecated alias for `daemon`.
- `run-benchmark-smoking.ts`; results under `benchmark-results/bunny-agent/smoking/bunny-agent-{transport}-{runner}-…json`.
- **`run-benchmark.sh`**: passes `--transport` / `--daemon-url`. Prefer `./run-benchmark.sh` from repo root (`source .env`); the benchmark CLI does not load `.env` itself.

---

## Coding run (daemon curl in sandbox)

- JSON body is **uploaded** under `SANDBOX_CODING_RUN_TMP_DIR`, **`curl` uses `@file`**, then **`rm -f`** (no stdin/base64 in the remote shell).
- Remote `sh -c` uses **`trap 'rm -f "$REQ"' EXIT INT TERM`** so the temp file is dropped on normal exit, curl failure, or signals; `buildCodingRunShellScript` exported for tests.

---

## RunnerSpec and CLI

- Removed **`RunnerSpec.kind`** (was always `claude-agent-sdk`). SDK no longer sets `kind`; **`apps/manager-cli`** `bunny-agent run` does not pass it.

---

## Pi runner (`packages/runner-pi`)

- Provider keys in **`options.env`** are passed as **literals** to `registerProvider` where needed and via **`AuthStorage.setRuntimeApiKey`** so catalog models authenticate **without** writing secrets into `process.env` during `run()`.

---

## Sandock `exec`

- Merged env is sent in the Sandock **`shell` / `shell/stream` body** (`env`, `workdir`) instead of `export VAR=…` prefixes on the command string.

---

## Docker (`docker/bunny-agent-claude/Dockerfile`)

- BuildKit **apt cache mounts** on apt steps; **nginx** folded into the first apt layer to drop an extra apt cycle.

---

## Changeset fixed group at `0.9.10` (2026-03-26)

- Verified `.changeset/config.json` **fixed** packages (`@bunny-agent/daemon`, `manager`, `runner-cli`, `sandbox-e2b`, `sandbox-sandock`, `sandbox-daytona`, `sdk`) all at **`0.9.10`** in `package.json`.
- Normalized each package `CHANGELOG.md`: **`## 0.9.10`** is the newest section (removed duplicate mid-file blocks and erroneous “Release v0.9.11” lines).
