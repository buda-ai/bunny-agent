# Changelog - 2026-05-05 - AI SDK streamText alignment

## Summary

Aligned Bunny custom tools with the standard AI SDK `streamText` entry point.
Applications import `streamText` and `tool` from `ai`; Bunny only provides the
AI SDK provider and runner-executed tool helpers.

## Changes

- Removed the public Bunny `streamText` wrapper from SDK exports.
- Moved Bunny tool helper logic into provider-level `ToolRef` compilation based
  on AI SDK `providerOptions`.
- Documented that AI SDK does not pass host-side `tool({ execute })` callbacks
  through the provider boundary.
- Updated the web demo route to pass tools through standard AI SDK `streamText`
  while exposing demo implementations through dynamic HTTP runtime tools.
- Replaced the web demo's custom `DemoToolDefinition` shape with a standard AI
  SDK `ToolSet`.
- Added tests for direct HTTP runtime metadata, sandbox module runtime metadata,
  provider-boundary errors for ordinary host-side execute tools, and
  runner-harness execution of HTTP/module tool refs.
- Removed the unused host gateway implementation and public gateway exports from
  `@bunny-agent/manager`; runner-executed tools now use the `http` or `module`
  runtimes only.
- Marked Bunny runner-executed helper tools as AI SDK dynamic tools so UI
  streams emit `dynamic: true` for custom provider-executed tool parts.
- Added a provider-side fallback so runner SSE tool events with
  `providerExecuted: true` are treated as dynamic tool events even when older
  runners omit the `dynamic` flag.

## Verification

- `@bunny-agent/manager`: typecheck, build, and tests.
- `@bunny-agent/sdk`: typecheck, build, and tests.
- `@bunny-agent/runner-harness`: typecheck and tests.
- `@bunny-agent/web`: `types:check`.
