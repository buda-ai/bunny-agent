# Tools Architecture

Bunny Agent tools follow one rule: **application developers define AI SDK
tools; Bunny compiles them into serializable runner tool refs before the
request enters the sandbox**.

This document describes the internal architecture. For public usage examples,
see `apps/web/content/docs/tools/custom-tools.mdx`.

## Goals

1. Keep the public API aligned with AI SDK:
   `streamText({ model: bunny(...), tools: { ... } })`.
2. Never serialize JavaScript `execute` functions into a sandbox.
3. Use one runner wire format for every executable tool: `ToolRef[]`.
4. Keep ownership boundaries clear:
   - SDK owns AI SDK tool compilation.
   - `ToolGateway` owns host-side `execute` dispatch.
   - `SandboxAdapter` owns sandbox lifecycle and process execution.
   - runner-harness owns in-sandbox tool registration.

## Public API

Applications use Bunny's AI SDK-compatible wrapper:

```ts
import { createBunnyAgent, streamText } from "@bunny-agent/sdk";
import { tool } from "ai";
import { z } from "zod";

const bunny = createBunnyAgent({ sandbox, env, toolGateway });

const result = streamText({
  model: bunny("gpt-5.2"),
  prompt: "Look up user u_123",
  tools: {
    lookupUser: tool({
      description: "Look up a user by id",
      inputSchema: z.object({ userId: z.string() }),
      execute: async ({ userId }, { abortSignal }) => {
        return db.user.findUnique({ where: { id: userId }, signal: abortSignal });
      },
    }),
  },
});
```

The wrapper is required because AI SDK removes provider-side `execute`
callbacks before it calls `LanguageModelV3.doStream`. Bunny must compile the
tools before that provider boundary. The wrapper also presents tools back to AI
SDK as dynamic tools, so provider-executed runner tool calls render as dynamic
UI tool parts.

## Internal Shapes

### `PendingTool`

`PendingTool` is a host-side closure compiled from AI SDK `tool({ execute })`.
It is never sent to the sandbox.

```ts
interface PendingTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: unknown, ctx: { signal: AbortSignal; sessionId?: string }): Promise<unknown>;
}
```

### `ToolRef`

`ToolRef` is the serializable runner wire format. It carries the LLM-facing
tool spec plus the runtime descriptor the sandbox runner uses when the model
calls the tool.

```ts
interface ToolRef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  runtime:
    | { type: "gateway"; bridge: ToolBridge }
    | { type: "http"; url: string; headers?: Record<string, string> }
    | { type: "module"; module: string; exportName?: string };
}
```

## Runtime Model

| Runtime | Where execution happens | Needs host `ToolGateway` |
| --- | --- | --- |
| `gateway` | Application process, through a gateway callback | Yes |
| `http` | Existing HTTP endpoint reachable from the sandbox | No |
| `module` | Module already present inside the sandbox | No |

Gateway runtime is used for AI SDK `tool({ execute })`. Direct HTTP and module
runtimes are explicit Bunny helpers for cases where no host JavaScript closure
is needed.

## Compilation Flow

```
application process
────────────────────────────────────────────────────────────────────

streamText({ model: bunny(...), tools })
        │
        ▼
@bunny-agent/sdk streamText wrapper
        │
        │  AI SDK tool({ execute })  -> PendingTool + gateway ToolRef
        │  bunnyHttpTool(...)        -> http ToolRef
        │  bunnySandboxTool(...)     -> module ToolRef
        ▼
model settings: compiledToolRefs Promise
        │
        ▼
BunnyAgentLanguageModel.doStream()
        │
        │  await compiledToolRefs
        │  register PendingTool[] if any gateway ToolRefs are pending
        ▼
ToolGateway.register({ tools, sessionId, signal })
        │
        │ returns ToolBridge
        ▼
ToolRef[] with concrete runtime descriptors
        │
        ├─ CLI mode: env BUNNY_AGENT_TOOL_REFS_JSON
        └─ daemon mode: BunnyAgentCodingRunBody.toolRefs
```

## ToolGateway

`ToolGateway` is host-side. It owns JavaScript functions supplied by the
application and exposes a callback descriptor the sandbox runner can call.

```ts
interface ToolGateway {
  register(input: {
    tools: PendingTool[];
    sessionId?: string;
    signal?: AbortSignal;
  }): Promise<{
    bridge: ToolBridge;
    close(): Promise<void>;
  }>;
}
```

The gateway is not a sandbox adapter hook. This is intentional: remote sandbox
adapters should not receive application business functions. They only need to
run processes in the sandbox; gateways solve host callback reachability.

Built-in gateway helpers:

- `createLocalToolGateway()` uses a unix domain socket for `LocalSandbox`.
- `createHttpToolGateway({ url })` returns a gateway whose `handleRequest()`
  can be mounted on an existing Node HTTP server.
- `createStandaloneHttpToolGateway()` starts a small HTTP server for tests and
  simple deployments.

`LocalSandbox` gets a default local unix gateway when no `toolGateway` is
configured. Remote sandboxes require a `toolGateway` only when the stream has
AI SDK tools with `execute`. Direct HTTP and sandbox module tools do not need a
host gateway.

## Runner Wire Transport

### CLI Mode

`BunnyAgent.stream` serializes tool refs into one internal environment
variable:

```ts
BUNNY_AGENT_TOOL_REFS_JSON = JSON.stringify({
  tools: toolRefs,
});
```

`apps/runner-cli` reads and immediately deletes the variable before starting
the runner so bearer tokens and HTTP headers do not leak to child tools such as
bash. There is no public CLI `--tools` flag; developers pass tools through AI
SDK `streamText({ tools })`.

### Daemon Mode

`BunnyAgentCodingRunBody` carries:

```ts
{
  userInput,
  toolRefs: ToolRef[]
}
```

`apps/daemon` passes `toolRefs` directly to `runner-harness`.

## Runner Execution

`packages/runner-harness/src/remote-tools.ts` converts `ToolRef[]` into
pi-runner `ToolDefinition[]` through `buildToolDefinitions(toolRefs)`.

Runtime behavior:

- `gateway`: proxy `{ name, input }` to the `ToolBridge` transport.
- `http`: `fetch(runtime.url)` directly from the sandbox runner.
- `module`: dynamic `import(runtime.module)` and call `exportName ?? "execute"`.

Only the proxy function lives in the sandbox for `gateway` tools. The original
application `execute` function remains in the host process.

## Abort Semantics

The upstream AI SDK abort signal is passed into the gateway registration. When
a gateway dispatches a host-side tool, `PendingTool.execute(input, ctx)`
receives that same stream-level signal as `ctx.signal`.

HTTP and module runtimes execute in the sandbox runner and receive the
runner-side tool call signal from pi-runner.

## Security Notes

- Gateway runtime keeps application secrets and connection pools in the host
  process. The sandbox sees only the bridge descriptor.
- HTTP runtime sends headers/tokens into the sandbox runner. Use it only when
  the endpoint credential is safe for the sandbox boundary.
- CLI env transport is short-lived and scrubbed immediately by runner-cli, but
  it still places descriptors in the runner process environment briefly.
- Module runtime executes sandbox code. Treat the module path as sandbox-local
  trusted code.

## Key Files

| File | Responsibility |
| --- | --- |
| `packages/sdk/src/provider/stream-text.ts` | Bunny streamText wrapper and tool compilation |
| `packages/sdk/src/provider/bunny-agent-language-model.ts` | Await compiled tool refs, register gateway, start runner |
| `packages/manager/src/types.ts` | `ToolRef`, `PendingTool`, `ToolGateway`, `ToolBridge` |
| `packages/manager/src/tool-bridge-http.ts` | HTTP `ToolGateway` helpers |
| `packages/manager/src/tool-bridge-unix.ts` | Unix bridge transport for local gateway |
| `packages/runner-harness/src/remote-tools.ts` | Tool execution inside sandbox runner |
| `apps/runner-cli/src/cli.ts` | CLI env decode/scrub |
| `apps/daemon/src/routes/coding.ts` | Daemon `toolRefs` body passthrough |
