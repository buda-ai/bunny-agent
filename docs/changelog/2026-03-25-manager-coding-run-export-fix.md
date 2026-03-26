## 2026-03-25

- Restored missing `@sandagent/manager` exports in `packages/manager/src/coding-run.ts`:
  `buildDefaultCodingRunExec`, `buildDefaultDaemonCodingRunExecCommand`,
  `SANDAGENT_DAEMON_HEALTHZ_PATH`, and `probeSandagentDaemonHealth`.
- Added `DaemonCodingRunExecParams` and re-exported it from
  `packages/manager/src/index.ts` for `@sandagent/sandbox-sandock` compatibility.
- Refactored `streamCodingRunFromSandbox` to reuse the restored command builder.
- Relaxed daemon health response parsing in
  `packages/manager/src/coding-run.ts` to treat JSON payloads like
  `{"ok":true,"data":{"status":"ok"}}` as healthy, preventing false negatives
  during Sandock startup polling.
- Sandock `SandboxHandle.exec`: on non-zero exit, log stderr (and stdout when
  stderr is empty) via `console.error` so failed `curl` runs surface in server logs.
- Sandock `exec`: retain streamed stderr for host logs (curl errors often only
  appear on SSE stderr, not in `result.data.stderr`); warn on `curl` exit 0 with
  non-empty stderr.
- Daemon coding-run `curl` always uses `--fail` (no env var) in
  `packages/manager/src/coding-run.ts` and `buildDaemonCodingRunExec`.
- Sandock `exec`: log a one-line `curl finished` summary (exit, duration,
  streamed vs aggregate stdout/stderr char counts) so host logs show outcome
  even when the response body is only forwarded to the stream consumer.
- Fixed provider stream parsing in `packages/sdk/src/provider/sandagent-language-model.ts`:
  accept both SSE (`data: {...}`) and raw NDJSON lines from daemon
  `/api/coding/run`, so UI receives message parts instead of blank responses.
- Added legacy NDJSON compatibility in provider parser:
  map `{ "type": "text", "text": "..." }` into `text-start/text-delta/text-end`,
  and map `{ "error": "..." }` (without `type`) to `error` events.
- Unified error stream format:
  - `apps/daemon/src/routes/coding.ts` catch now emits SSE `data:` events
    (`error` + `finish` + `[DONE]`) instead of `{ error: ... }` JSON lines.
  This makes `sandbox exec` and `coding run` outputs consistent so the SDK
  can convert uniformly.
- Moved sandagent-daemon `/healthz` probing logic from `@sandagent/manager`
  into `packages/sandbox-sandock/src/sandock-sandbox.ts`, so Sandock adapter
  no longer depends on `probeSandagentDaemonHealth` being re-exported.
- Updated SDK `SandAgentLanguageModel.doGenerate()` to actually surface
  `type:"error"` stream parts into UI content + `finishReason=error`.
- Per-request runner env: optional **`env`** on `POST /api/coding/run` JSON only
  (merged after daemon `process.env` via `mergeCodingRunProcessEnv` in the daemon).
- `streamCodingRunFromSandbox` serializes `body` as-is; **`ExecOptions.env` is not
  used** (runner keys go in `SandAgentCodingRunBody.env`). SDK daemon path builds
  `body.env` from sandbox + provider env. Removed `codingRunHeaders` /
  `inheritSandboxEnv`; curl argv is Content-Type + `--data-binary @file` only.
- `SANDBOX_CODING_RUN_TMP_DIR` lives in `coding-run.ts`. Removed unused
  `runner-env-file.ts` and legacy `runner-env-header.ts` (base64 header helpers);
  daemon owns coding-run env merge.
- `@sandagent/daemon` no longer depends on `@sandagent/manager`; coding-run env merge
  lives in `apps/daemon/src/coding-run-env.ts` (`mergeCodingRunProcessEnv`).
