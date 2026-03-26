# benchmark-sandagent: CLI / daemon / Sandock smoking runs (2026-03-26)

## `packages/benchmark-sandagent`

- **`run` command**: `--transport cli|daemon` (default `cli`), optional `--daemon-url` (in-sandbox daemon base URL).
- **`cli`**: `sandagent run --runner <name> -- …`.
- **`daemon`**: **Sandock only** — same pattern as web `/api/ai`: sandbox env from `create-sandbox`-style `buildRunnerEnv`, then `streamCodingRunFromSandbox` to in-container daemon (default `http://127.0.0.1:3080`). No host `fetch` to laptop daemon.
- **`sandock`** as a transport name is removed; CLI and `run-benchmark.sh` treat `sandock` as an alias for `daemon` (deprecated warning).
- New `src/run-benchmark-smoking.ts`; `runner.ts` delegates to it.
- Result files: `benchmark-results/sandagent/smoking/sandagent-{transport}-{runner}-…json`.
- Dependencies: `@sandagent/manager`, `@sandagent/sandbox-sandock`.
- Use `./run-benchmark.sh` from repo root (it `source`s `.env`) or export vars before `node dist/cli.js`; the CLI does not load `.env` by itself.
- Sandock sandbox options and POST `env` still mirror `create-sandbox.ts` / SDK (`sandbox.getEnv()`).

## `run-benchmark.sh`

- **`--transport`**, **`--daemon-url`** passed through to the smoking CLI.
