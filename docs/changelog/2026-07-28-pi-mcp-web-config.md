# Pi MCP Web Configuration

## Summary

This session adds request-scoped MCP server configuration to the Pi runner and
lets the example web app supply validated remote MCP servers.

## Changes

- Started the Pi MCP integration on top of `pi-mcp-adapter` 2.15.0.
- Defined the trusted runner configuration boundary and the stricter
  HTTPS-only web boundary.
- Added bounded validation and defensive cloning for trusted HTTP and stdio
  MCP server definitions.
- Loaded the adapter as a request-scoped inline Pi extension and respected
  explicit tool allowlists by requiring the `mcp` tool.
- Bound Pi extensions in print mode before prompting and now await
  `session_shutdown` before disposal so adapter resources are released.
- Propagated MCP configuration through the runner harness and daemon request.
- Added a size-capped one-shot CLI payload that is removed from the process
  environment before runner startup.
- Exposed `mcpConfig` through the SDK provider and forwarded it through both
  daemon and CLI execution paths.
- Added focused coverage for config validation, allowlist behavior, payload
  consumption, size bounds, and cross-package propagation.
- Added the public-web HTTPS validator, private and localhost literal checks,
  bounded bearer/custom-header authentication, and hardened adapter settings.
- The example API now converts MCP input only for Pi and returns HTTP 400 for
  invalid public configuration before sandbox creation.
- Added a versioned browser-stored MCP server manager with add, edit, delete,
  enabled toggle, bearer auth, custom headers, and masked secret inputs.
- The chat page refreshes environment and MCP browser state on storage events
  and includes MCP servers only for Pi requests, so changes apply next turn.
- Documented trusted SDK HTTP/stdio configuration, the public HTTPS-only web
  schema, next-turn semantics, authentication limits, and egress requirements.
- Added a real Streamable HTTP fixture that exercises adapter loading, server
  connection, tool discovery, and proxy-tool execution without an LLM call.
- Kept `jiti` external to the published ESM runner bundle and declared it as a
  runtime dependency so adapter loading does not rely on workspace hoisting or
  unsupported bundled CommonJS dynamic requires.
- Applied the same external runtime dependency boundary to the daemon bundles
  after an isolated package deploy exposed Jiti's missing sibling module in a
  single-file bundle.
- Expanded cross-layer coverage for CLI and daemon SDK propagation, changed
  configuration on fresh and resumed turns, Pi-only web request inclusion,
  password rendering for browser secrets, transcript redaction, and transport
  closure during session shutdown.

## Verification

- `pnpm typecheck`
- `pnpm --filter @bunny-agent/web types:check`
- `pnpm test`
- `pnpm build`
- Changed-file `pnpm exec biome check --files-ignore-unknown=true ...`
- `git diff --check`
- Isolated production-package smoke tests for the daemon and runner CLI,
  including cold adapter loading without workspace hoisting.
- Real local Streamable HTTP MCP integration covering connection, discovery,
  tool invocation, session shutdown, and transport disposal.
- Browser checks at 1440x900 and 390x844 covering add, edit, delete, enable,
  masked authentication, persistence, navigation, responsive layout, and
  console errors.
- Live development-server checks: `/example/settings` returned HTTP 200, and
  `/api/ai` rejected an unsafe `http://127.0.0.1` MCP URL with HTTP 400 before
  sandbox validation.
