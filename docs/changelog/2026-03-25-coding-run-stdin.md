# Changelog: Coding run — keep `/tmp` JSON + `rm` only

## Reverted: stdin / base64-in-shell for `streamCodingRunFromSandbox`

The previous approach avoided a temp file by embedding base64 in the remote shell command. That survives in platform **command history** and cannot be removed like a file, which is worse for operators who rely on **`rm` after `curl`**.

## Current behavior (`packages/manager/src/coding-run.ts`)

- Always **upload** the POST JSON under `SANDBOX_CODING_RUN_TMP_DIR` (`/tmp`), run **`curl @file`**, then **`rm -f`** in `finally` (best-effort).

## Removed

- `ExecOptions.stdin`, `CODING_RUN_MAX_STDIN_PAYLOAD_BYTES`, `buildDaemonCodingRunUrl`, `buildStdinDaemonCodingRunCurlArgs`, and stdin/base64 handling in Sandock / E2B / Daytona / LocalSandbox `exec`.
