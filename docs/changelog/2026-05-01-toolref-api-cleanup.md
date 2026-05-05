# Changelog — 2026-05-01 — ToolRef API cleanup

## Summary

Cleaned up the custom tool architecture naming so public developers only use
AI SDK `tool()` through Bunny's `streamText` wrapper. Internal code now uses
`ToolRef` for the serializable runner wire format and `PendingTool` for
host-side `execute` closures waiting for gateway registration.

## Changes

- Renamed internal request fields to `toolRefs` across manager, SDK provider
  settings, runner-harness, runner-cli, and daemon routes.
- Replaced the previous host executor type with `PendingTool`.
- Renamed the runner-harness registration helper to
  `buildToolDefinitions(...)`.
- Renamed the private CLI transport variable to
  `BUNNY_AGENT_TOOL_REFS_JSON`.
- Updated the web demo tool registry to define plain demo tool definitions and
  let the route convert them into AI SDK `tool()` calls.
- Rewrote `docs/TOOLS_ARCHITECTURE.md` around public AI SDK tools and the
  internal `ToolRef` / `PendingTool` split.

## Verification

- `@bunny-agent/manager`: typecheck, build, and tests.
- `@bunny-agent/runner-harness`: typecheck, build, and tests.
- `@bunny-agent/sdk`: typecheck, build, and tests.
- `@bunny-agent/runner-cli`: typecheck, build, and tests.
- `@bunny-agent/daemon`: typecheck, build, and tests.
- `@bunny-agent/web`: `types:check`.
