---
"@bunny-agent/manager": patch
"@bunny-agent/sdk": patch
---

Add optional `SandboxHandle.supportsExec?()` and skip Pi search contract
discovery when an adapter reports it cannot execute commands. `exec` is required
by the interface, but relay-style adapters implement it only to satisfy the type
and yield a diagnostic string instead of shell output. The discovery probe ran
`curl` through `exec`, failed to parse a status from that string, and threw
`Search capability discovery failed (HTTP unknown)`, which rejected `doStream()`
and ended the whole turn.

An exec-less sandbox now reports no new search contract — the same outcome as a
daemon that predates the contract — instead of failing. Daemon URL validation
still runs first, so a malformed URL remains a configuration error. Adapters
that omit `supportsExec` keep probing exactly as before.
