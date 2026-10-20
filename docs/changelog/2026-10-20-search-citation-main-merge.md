# Merge current main into the search citation contract

## Changes

- Resolve the SDK stream-decoder conflict by retaining one streaming UTF-8
  decoder per response, including its final flush, alongside citation metadata.
- Retain main's Pi 1.3.0 upgrade, MCP transpile cache, and removal of the daemon
  coding-run wall-clock timeout.
- Keep the provider-utils snapshot's declared undici dependency while resolving
  the lockfile conflict.
- Reuse the existing byte-split citation stream fixtures and main's UTF-8
  regressions to verify completed AI SDK messages and Unicode citation ranges.

## Verification

- Frozen, offline SDK dependency installation passed.
- SDK dependency packages built successfully.
- Citation stream mapping, UTF-8 decoding, and daemon timeout regressions:
  3 files / 10 tests passed.
- SDK typecheck, scoped Biome, and staged diff checks passed.
- Reuse the live-provider and consumer acceptance recorded in merged PR #449;
  those checks were not repeated for this conflict-only merge.
- Published SDKs and container images were not built or deployed.
