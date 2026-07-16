---
"@bunny-agent/manager": minor
"@bunny-agent/sandbox-local": minor
"@bunny-agent/sandbox-srt": minor
"@bunny-agent/sdk": minor
"@bunny-agent/manager-cli": patch
---

Split the local adapters out of `@bunny-agent/manager` into standalone packages, mirroring the cloud adapter family:

- `@bunny-agent/sandbox-local` — `LocalMachine` (renamed from `LocalSandbox`, which remains as a deprecated alias): runs commands directly on the host with NO isolation.
- `@bunny-agent/sandbox-srt` — `SrtSandbox`: same API, but every command is wrapped with Anthropic's sandbox runtime (bubblewrap on Linux, Seatbelt on macOS, srt-win alpha on Windows) enforcing allow-only network and write policies.

`@bunny-agent/sdk` re-exports `LocalMachine`, `LocalSandbox` (deprecated), and `SrtSandbox`, so sdk consumers are unaffected. Direct `@bunny-agent/manager` importers of `LocalSandbox` should switch to `@bunny-agent/sandbox-local` (or the sdk re-export).
