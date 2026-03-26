# fix/daemon branch — consolidated notes (2026-03-25–26)

## In-sandbox daemon HTTP, health probe, SDK

- **`@sandagent/manager`**: `isSandagentDaemonHealthy` probes `<base>/healthz` via `SandboxHandle.exec` and curl `-w '%{http_code}'` (true only on **200**; connect/max-time caps; default single attempt ~4s). Re-exported from **`@sandagent/sdk`**. Unit tests cover non-200, `000`, empty output, sync `exec` throw, and iterator rejection.
- **`@sandagent/sdk`**: With `daemonUrl`, streams use `streamCodingRunFromSandbox` only — **no** automatic `/healthz` on each request. Apps call `isSandagentDaemonHealthy` when they want readiness checks or CLI fallback.
- **`@sandagent/sandbox-sandock`**: Removed attach-time daemon readiness (`daemon-health.ts`, `waitForSandagentDaemonIfConfigured`, related options and helpers).
- **`apps/web`**: Example API probes daemon before passing `daemonUrl` when `USE_SANDAGENT_DAEMON`; sandbox creation comments updated.

## benchmark-sandagent smoking

- **`run`**: `--transport cli|daemon` (default `cli`), optional `--daemon-url`. `daemon` is Sandock-only: `buildRunnerEnv` + `streamCodingRunFromSandbox` to in-container daemon (default `http://127.0.0.1:3080`). `--transport sandock` is a deprecated alias for `daemon`.
- New `run-benchmark-smoking.ts`; results under `benchmark-results/sandagent/smoking/sandagent-{transport}-{runner}-…json`.
- **`run-benchmark.sh`**: passes `--transport` / `--daemon-url`. Prefer `./run-benchmark.sh` from repo root (`source .env`); the benchmark CLI does not load `.env` itself.

## Coding run (daemon curl in sandbox)

- JSON body is **uploaded** under `SANDBOX_CODING_RUN_TMP_DIR`, **`curl` uses `@file`**, then **`rm -f`** (no stdin/base64 in the remote shell — avoids secrets in command history).
- Remote `sh -c` uses **`trap 'rm -f "$REQ"' EXIT INT TERM`** so the temp file is dropped on normal exit, curl failure, or common signals; redundant client-side `finally rm` removed. `buildCodingRunShellScript` exported for tests.

## RunnerSpec and CLI

- Removed **`RunnerSpec.kind`** (was always `claude-agent-sdk`). SDK no longer sets `kind`; **`apps/manager-cli`** `sandagent run` does not pass it.

## Pi runner (`packages/runner-pi`)

- Provider keys in **`options.env`** are passed as **literals** to `registerProvider` where needed and via **`AuthStorage.setRuntimeApiKey`** so catalog models authenticate **without** writing secrets into `process.env` during `run()`. Configuration is read from `options.env`; shell children still only see host `process.env` unless the host already exports vars.

## Sandock `exec`

- Merged env is sent in the Sandock **`shell` / `shell/stream` body** (`env`, `workdir`) instead of `export VAR=…` prefixes on the command string (less exposure in logs/history). Key names may appear in debug logs; values are not logged.

## Docker (`docker/sandagent-claude/Dockerfile`)

- BuildKit **apt cache mounts** on apt steps; **nginx** folded into the first apt layer to drop an extra apt cycle.
