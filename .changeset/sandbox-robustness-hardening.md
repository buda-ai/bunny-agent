---
"@bunny-agent/sandbox-local": patch
"@bunny-agent/sandbox-srt": patch
"@bunny-agent/sandbox-sandock": patch
---

Robustness hardening across the local/srt/sandock adapters:

- `LocalMachine`: abort/timeout now kills the whole process tree (not just the direct child), catching backgrounded grandchild processes that previously survived as orphans.
- `SrtSandbox`: fixed a temp-directory leak on `destroy()`; added a preflight check on `attach()` with an actionable, platform-aware error when bubblewrap/socat/ripgrep are missing.
- `SandockSandbox`: retries transient network errors (e.g. a dropped connection to sandock.ai) on safe, idempotent-ish calls; does not retry `exec`/`shell` calls, which can have non-idempotent side effects.
