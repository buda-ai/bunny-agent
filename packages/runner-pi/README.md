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
