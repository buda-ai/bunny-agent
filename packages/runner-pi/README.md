# @bunny-agent/runner-pi

Pi agent runner for Bunny Agent.

## Installation

```bash
npm install @bunny-agent/runner-pi
```

## Usage

```ts
import { createPiRunner } from "@bunny-agent/runner-pi";

const runner = createPiRunner({
  model: "google:gemini-2.5-pro",
  cwd: process.cwd(),
});

for await (const chunk of runner.run("Create a hello world script")) {
  process.stdout.write(chunk);
}
```

## Options

- `model`: model id in `<provider>:<model>` format, for example `google:gemini-2.5-pro`
- `systemPrompt`: custom system prompt
- `cwd`: working directory for coding tools
- `env`: environment overrides (used for runtime configuration such as base URLs)
- `abortController`: signal-driven cancellation
- `mcpConfig`: request-scoped MCP servers loaded through `pi-mcp-adapter`

## Gateway Model Capabilities

When a model is not found under its selected provider, Bunny dynamically registers
it using the configured gateway and the OpenAI Chat Completions API. Recognized
Claude, Gemini, DeepSeek, and OpenAI model IDs reuse capabilities from Pi's native
provider catalog without changing the gateway URL, credentials, or API protocol.
Only exact catalog IDs match; unknown aliases do not inherit guessed limits.

Bunny's explicit Gemini 3.7/3.8 Flash profiles retain their 65,536-token output
limit. Other unknown models default to a 128,000-token context window and a
16,384-token output limit, matching Pi's custom-model output default. Capabilities
are based on the requested model, including when the gateway falls back to another
model.

## Request-Scoped MCP

Pi can connect to HTTP(S) or stdio MCP servers without writing an `mcp.json`
file:

```ts
const runner = createPiRunner({
  model: "openai:gpt-5",
  allowedTools: ["read", "bash", "mcp"],
  mcpConfig: {
    mcpServers: {
      remote: {
        url: "https://mcp.example.com/rpc",
        auth: "bearer",
        bearerToken: process.env.MCP_TOKEN,
        lifecycle: "lazy",
      },
      sandboxLocal: {
        command: "node",
        args: ["/workspace/mcp-server.mjs"],
      },
    },
  },
});
```

Configuration is validated and cloned for each run. When `allowedTools` is
explicit, it must contain `mcp`; otherwise the adapter is not loaded. Session
disposal shuts down adapter transports and stdio processes.

HTTP headers, bearer tokens, stdio commands, and environment variables are
trusted-server inputs. Browser applications should expose a narrower
HTTPS-only schema and enforce sandbox egress controls.

## Output

Produces AI SDK UI data stream (SSE) chunks.
