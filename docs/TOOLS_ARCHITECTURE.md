# Tools Architecture

Bunny Agent tools follow one rule: **applications use the standard AI SDK
`streamText` and `tool` APIs; Bunny only implements an AI SDK provider**.

This document describes the internal architecture. For public usage examples,
see `apps/web/content/docs/tools/custom-tools.mdx`.

## Goals

1. Keep the public API aligned with AI SDK:
   `import { streamText, tool } from "ai"`.
2. Never serialize JavaScript `execute` functions into a sandbox.
3. Use one runner wire format for runner-executed tools: `ToolRef[]`.
4. Keep ownership boundaries clear:
   - AI SDK owns host-side `tool({ execute })` execution.
   - Bunny provider owns conversion from provider-level tool schemas to
     runner `ToolRef[]`.
   - `SandboxAdapter` owns sandbox lifecycle and process execution.
   - runner-harness owns in-sandbox tool registration.

## Public API

Applications use the AI SDK directly:

```ts
import { bunnyHttpTool, createBunnyAgent } from "@bunny-agent/sdk";
import { streamText } from "ai";
import { z } from "zod";

const bunny = createBunnyAgent({ sandbox, env });

const result = streamText({
  model: bunny("gpt-5.2"),
  prompt: "Get the weather in Paris.",
  tools: {
    weather: bunnyHttpTool({
      description: "Get current weather",
      inputSchema: z.object({ city: z.string() }),
      endpoint: {
        url: "https://your-app.com/api/tools/weather",
        headers: {
          Authorization: `Bearer ${process.env.TOOL_API_TOKEN}`,
        },
      },
    }),
  },
});
```

The call uses standard AI SDK `streamText({ tools })`. Bunny helpers add
provider-visible runtime metadata so the sandbox runner can execute the tool.

Plain AI SDK `tool({ execute })` callbacks are client-executed tools. AI SDK
does not pass those JavaScript closures through `LanguageModelV3.doStream`, so
Bunny cannot automatically expose arbitrary host closures to pi-runner without
an explicit runner runtime such as HTTP or a sandbox module.

## Provider Boundary

AI SDK calls `LanguageModelV3.doStream(params)` with provider-facing tools:

```ts
type LanguageModelV3FunctionTool = {
  type: "function";
  name: string;
  description?: string;
  inputSchema: JSONSchema7;
  providerOptions?: SharedV3ProviderOptions;
};
```

This shape intentionally does not include the user-facing `execute` function.
Therefore Bunny cannot turn arbitrary `tool({ execute })` closures into
runner-executed tools from inside the provider.

## Internal Shape: `ToolRef`

`ToolRef` is the serializable runner wire format. It carries the LLM-facing
tool spec plus the runtime descriptor the sandbox runner uses when the model
calls the tool.

```ts
interface ToolRef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  runtime:
    | { type: "http"; url: string; headers?: Record<string, string> }
    | { type: "module"; module: string; exportName?: string };
}
```

## Runtime Model

| Runtime | Where execution happens | How it is configured |
| --- | --- | --- |
| `http` | Existing HTTP endpoint reachable from the sandbox | `bunnyHttpTool(...)` |
| `module` | Module already present inside the sandbox | `bunnySandboxTool(...)` |

## Compilation Flow

```
application process
────────────────────────────────────────────────────────────────────

AI SDK streamText({ model: bunny(...), tools })
        │
        ▼
AI SDK prepares provider-level LanguageModelV3FunctionTool[]
        │
        ▼
BunnyAgentLanguageModel.doStream(params)
        │
        │  params.tools + providerOptions -> ToolRef[]
        │  bunnyHttpTool(...)             -> http ToolRef
        │  bunnySandboxTool(...)          -> module ToolRef
        ▼
ToolRef[] with concrete runtime descriptors
        │
        ├─ CLI mode: env BUNNY_AGENT_TOOL_REFS_JSON
        └─ daemon mode: BunnyAgentCodingRunBody.toolRefs
```

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

`runner-harness` treats `ToolRef[]` as runner-agnostic configuration and only
passes it to runners that support custom tools. The pi runner owns the
conversion in `packages/runner-pi/src/tool-refs.ts`, where `ToolRef[]` becomes
pi-runner `ToolDefinition[]`.

Runtime behavior:

- `http`: `fetch(runtime.url)` directly from the sandbox runner.
- `module`: dynamic `import(runtime.module)` and call `exportName ?? "execute"`.

## Abort Semantics

HTTP and module runtimes execute in the sandbox runner and receive the
runner-side tool call signal from pi-runner.

Host-side AI SDK `tool({ execute })` callbacks receive AI SDK's normal
`abortSignal`; they are not part of Bunny's runner bridge.

## Security Notes

- HTTP runtime sends headers/tokens into the sandbox runner. Use it only when
  the endpoint credential is safe for the sandbox boundary.
- CLI env transport is short-lived and scrubbed immediately by runner-cli, but
  it still places descriptors in the runner process environment briefly.
- Module runtime executes sandbox code. Treat the module path as sandbox-local
  trusted code.

## Key Files

| File | Responsibility |
| --- | --- |
| `packages/sdk/src/provider/tool-refs.ts` | Bunny tool helpers and provider-level tool schema conversion |
| `packages/sdk/src/provider/bunny-agent-language-model.ts` | Compile tool refs and start runner |
| `packages/manager/src/types.ts` | `ToolRef`, `ToolRuntime` |
| `packages/runner-pi/src/tool-refs.ts` | Pi-owned `ToolRef` to `ToolDefinition` adapter |
| `apps/runner-cli/src/cli.ts` | CLI env decode/scrub |
| `apps/daemon/src/routes/coding.ts` | Daemon `toolRefs` body passthrough |
