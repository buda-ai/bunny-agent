# Structured workspace storage errors

- Added a shared BunnyAgent error normalizer for `EDQUOT`, `ENOSPC`, errno `-122`/`-28`, and known legacy runtime messages.
- Emit the stable `WORKSPACE_STORAGE_FULL` code and a path-free user-safe message from Pi, the runner harness, and the daemon error envelope.
- Preserve typed Pi prompt errors until normalization instead of reducing them to message strings.
- Restore daemon error codes as `BunnyAgentStreamError.code` in the SDK, including compatibility with older daemon text-only streams.
- Added focused tests for system fields, legacy text, provider quota false positives, SSE output, daemon envelopes, and SDK round trips.
