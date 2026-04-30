# Changelog — 2026-04-30 — `streamText({ tools })` black-box tool bridge

## Summary

`createBunnyAgent({ tools: [...] })` now accepts a list of `RemoteTool`s with
`execute` functions defined on the host side. The SDK transparently sets up a
sandbox-native callback channel so the in-sandbox runner can invoke each
tool — callers no longer construct or manage a `ToolBridge`, and there is no
HTTP route to register/revoke per request.

## Public API

### `@bunny-agent/sdk`

- `BunnyAgentProviderSettings.tools` is now typed as `RemoteTool[]` (was
  `RemoteToolSpec[]`). Each tool carries its own `execute(input, ctx)`. The
  user-facing `toolBridge` field is **removed** from provider settings — the
  SDK opens the bridge internally.
- `RemoteTool`, `RemoteToolExecutor`, `ToolExecutorContext` re-exported from
  `@bunny-agent/manager`.
- The SDK throws a clear error at stream start if `tools` is non-empty but the
  configured sandbox does not implement `createToolBridge` (`LocalSandbox`
  ships with one; remote-sandbox adapters can opt in later).

### `@bunny-agent/manager`

- New `SandboxAdapter.createToolBridge?` hook returning
  `{ bridge: ToolBridge; close(): Promise<void> }`. `close()` is idempotent,
  drains in-flight tool calls, and removes the socket directory.
- `ToolBridge` is a discriminated union — `{ transport: "http", url, token }`
  or `{ transport: "unix", socketPath }`. The unix variant has no token; auth
  comes from a 0700 per-session directory under `os.tmpdir()`.
- `LocalSandbox.createToolBridge` is implemented out of the box, backed by a
  new `createUnixToolBridge` helper exported from the package.

## Wire format (unix transport)

One connection per call. The protocol mirrors the HTTP transport so the
runner-side wrapper produces byte-equal tool results regardless of which
transport the sandbox chose:

```
client → server   {"name": string, "input": unknown}\n   (then half-close write side)
server → client   {"status": number, "body": string}\n   (server then closes)
```

`status` follows HTTP conventions (200 success, 404 unknown tool, 500 thrown
executor, 400 malformed request).

## CLI plumbing

- `BunnyAgent.stream` writes the active tools + bridge descriptor into
  `BUNNY_AGENT_TOOLS_BRIDGE_JSON` for the runner subprocess.
- `apps/runner-cli` reads the env var on startup, **immediately deletes it**
  before any child process can spawn, and forwards the parsed payload to
  `runAgent({ tools, toolBridge })`. This keeps any bearer token (HTTP
  variant) out of bash subprocesses started by tool calls.

## Runner harness

- `buildRemoteToolDefinitions` now switches on `bridge.transport` and shares a
  normalized `{ status, body }` envelope between transports. Error wording is
  transport-neutral (`failed (status N)` / `transport error: …`).
- New tests under `packages/runner-harness/src/__tests__/`:
  - `remote-tools.test.ts` — HTTP transport (existing tests retargeted at the
    new error format).
  - `remote-tools.unix.test.ts` — unix transport, including byte-equality
    assertions against HTTP for both success and error envelopes.

## apps/web demo

- Removed `lib/demo-tools/bridge.ts` (in-memory token store) and the
  `app/api/demo-tools/` route tree (entry point + bridge callback). Both are
  obsolete now that the SDK owns the transport.
- `lib/demo-tools/registry.ts` now exports `RemoteTool[]` directly via
  `getDemoTools()`. The previous `getDemoToolSpecs` / `DemoTool` shapes are
  gone.
- `app/api/ai/route.ts` is reduced to `tools: getDemoTools()` — no token
  registration, no callback URL plumbing, no per-stream cleanup hooks.

## Tests

All package suites pass: 92 (manager), 9 (runner-harness), 6 (sdk), 19
(runner-cli), 35 (daemon), and the rest unchanged.
