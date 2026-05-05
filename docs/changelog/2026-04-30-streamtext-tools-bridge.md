# Changelog — 2026-04-30 — Tool refs and host ToolGateway

## Summary

Reworked custom tools around execution locality instead of sandbox adapter
callbacks. Application developers use Bunny's AI SDK-compatible
`streamText({ tools })` wrapper. The SDK compiles tools into a single runner
wire format, `ToolRef[]`, before the request enters runner-cli or
bunny-agent-daemon.

## Public API

### `@bunny-agent/sdk`

- Added Bunny's `streamText` wrapper. It preserves the AI SDK call shape while
  compiling tools before AI SDK strips `execute` functions at the provider
  boundary.
- The wrapper now passes AI SDK tools through a dynamic-tool view after Bunny
  compiles runtime tools. This keeps provider-executed pi-runner tools rendered
  as `dynamic-tool` UI parts instead of static tool parts.
- Added `bunnyHttpTool(...)` for direct HTTP endpoint tools.
- Added `bunnySandboxTool(...)` for module tools that already exist inside the
  sandbox filesystem.
- `BunnyAgentProviderSettings` now accepts `toolGateway` for host-side
  `execute` callbacks and internal `toolRefs` metadata.
- Provider-level `tools` is no longer the primary API. Use call-level
  `streamText({ tools })`.

### `@bunny-agent/manager`

- Added `ToolRef` and `ToolRuntime`:
  - `gateway` runtime calls a host `ToolGateway`.
  - `http` runtime fetches a direct endpoint from inside the sandbox.
  - `module` runtime imports a sandbox-local module.
- Added `PendingTool` as the internal host-side closure shape waiting for
  gateway registration.
- Added `ToolGateway` and `ToolGatewayRegistration`. Gateways own host-side
  application `execute` functions; sandbox adapters no longer own tool
  dispatch.
- Removed `SandboxAdapter.createToolBridge` from the adapter interface.
- Added `createLocalToolGateway()` for LocalSandbox unix-socket callbacks.
- Reworked HTTP support into `createHttpToolGateway({ url })` with
  `handleRequest(req, res)` so applications can mount the gateway on their own
  server.
- Added `createStandaloneHttpToolGateway()` as a convenience helper for tests
  and simple deployments.

## Wire Format

### CLI mode

`BunnyAgent.stream` now writes one env var:

```ts
BUNNY_AGENT_TOOL_REFS_JSON = JSON.stringify({
  tools: toolRefs,
});
```

`apps/runner-cli` reads and immediately deletes the env var before any child
process can inherit tokens or HTTP headers. The CLI intentionally does not expose
a public custom-tools flag; developers use SDK `streamText({ tools })` instead.

### Daemon mode

`BunnyAgentCodingRunBody` now carries:

```ts
toolRefs?: ToolRef[];
```

The previous `tools + toolBridge` pair is replaced by this single field.

## Runner Tool Execution

- `ToolRef[]` is the only runner wire format for custom tools. A later cleanup
  moved the pi-native `ToolDefinition` adapter into runner-pi.
- Runtime behavior:
  - `http`: `fetch(runtime.url)` directly from the sandbox runner.
  - `module`: dynamic import and execute inside the sandbox runner process.
- Added tests for direct HTTP runtime and module runtime.

## Abort Semantics

The originating stream `AbortSignal` is passed into `ToolGateway.register`.
Gateway-dispatched host executors receive the same signal as `ctx.signal`.

## Documentation

- Rewrote `docs/TOOLS_ARCHITECTURE.md` around public AI SDK `tool()`,
  internal `ToolRef`, `PendingTool`, and host-side `ToolGateway`.
- Added `apps/web/content/docs/tools/custom-tools.mdx`, a public developer
  guide covering AI SDK tools, remote gateway setup, direct HTTP tools, and
  sandbox module tools.

## Verification

- `@bunny-agent/manager`: typecheck, build, and tests.
- `@bunny-agent/runner-harness`: typecheck, build, and tests.
- `@bunny-agent/sdk`: typecheck and tests.
- `@bunny-agent/runner-cli`: typecheck.
- `@bunny-agent/daemon`: typecheck.
- `@bunny-agent/web`: `types:check`.
