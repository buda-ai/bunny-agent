---
"@bunny-agent/manager": patch
"@bunny-agent/sandbox-sandock": patch
"@bunny-agent/sandbox-e2b": patch
"@bunny-agent/sandbox-daytona": patch
"@bunny-agent/sandbox-local": patch
"@bunny-agent/sdk": patch
---

Fix shell injection and masked exit codes in sandbox `exec()` adapters, and
surface deterministic startup/execution failures as a structured, explicitly
non-retryable `SandboxExecError` instead of a silent clean stream end.
