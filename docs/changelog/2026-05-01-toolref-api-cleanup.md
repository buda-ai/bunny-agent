# Changelog — 2026-05-01 — ToolRef API cleanup

## Summary

Cleaned up the custom tool architecture so public developers keep using the
standard AI SDK `streamText` and `tool` APIs. Internal code uses `ToolRef` for
the serializable runner wire format.

## Changes

- Renamed internal request fields to `toolRefs` across manager, SDK provider
  settings, runner-harness, runner-cli, and daemon routes.
- Standardized runner custom tool registration around the serializable
  `ToolRef[]` wire format.
- Renamed the private CLI transport variable to
  `BUNNY_AGENT_TOOL_REFS_JSON`.
- Renamed SDK/provider tool settings toward the `ToolRef` wire format. A later
  cleanup aligned the public entry point fully with AI SDK `streamText`.

## Verification

- `@bunny-agent/manager`: typecheck, build, and tests.
- `@bunny-agent/runner-harness`: typecheck, build, and tests.
- `@bunny-agent/sdk`: typecheck, build, and tests.
- `@bunny-agent/runner-cli`: typecheck, build, and tests.
- `@bunny-agent/daemon`: typecheck, build, and tests.
- `@bunny-agent/web`: `types:check`.
