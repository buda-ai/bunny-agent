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
- `toolRefs`: external HTTP or module tools, with bounded text output

## External Tool Output

External `toolRefs` responses are limited to 50 KiB or 2,000 lines, including
the truncation notice. This applies to successful responses, error responses,
and transport exception text. Smaller responses are returned unchanged.

Oversized responses are saved verbatim in the OS temporary directory
(`os.tmpdir()`, usually `/tmp`) in private files. The returned preview includes
an absolute path and instructions to use `read` with `offset`/`limit`, or `bash`
to extract a bounded fragment
from a long JSON line. Enable those tools when the agent needs to inspect the
full output. Pi also exposes the path and original size in `details.outputGuard`.

File retention follows Pi's native output files: cleanup depends on the OS or
sandbox temporary-directory lifecycle, with no Bunny TTL or session-end cleanup.
File availability across sandbox restarts or session resume is not guaranteed.
If saving fails, the preview remains bounded and explicitly reports that the
full output could not be saved. This protection
does not rewrite existing session history or limit HTTP download memory.

Limits apply per response; query filters and field selection still help keep
large tool batches within the model's total context budget.

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
