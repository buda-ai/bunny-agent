# Changelog — 2026-03-25 — Coding-run temp file cleanup

## `packages/manager`

- `streamCodingRunFromSandbox` runs curl via `sh -c` with `trap 'rm -f "$REQ"' EXIT INT TERM` around the request JSON path, so the file is removed when that remote shell exits (normal end, curl failure, or many signals). A separate `finally` `exec(rm)` was removed as redundant.
- Exported `buildCodingRunShellScript` for tests and advanced use.
