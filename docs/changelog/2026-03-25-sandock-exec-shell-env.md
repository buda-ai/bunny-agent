# Changelog — 2026-03-25 — Sandock exec env via API

## `packages/sandbox-sandock`

- `SandockHandle.exec` now passes merged environment variables through the Sandock `shell` / `shell/stream` request body (`env` and `workdir`) instead of prefixing the remote command with `export VAR=...`. Values no longer appear in the shell command string (reduces exposure in logs and command history on the wire shape).
- The command line is logged with `console.log`. Env key names passed to the Sandock shell API are logged with `console.debug` (values never logged); visibility depends on the runtime’s debug log level.
