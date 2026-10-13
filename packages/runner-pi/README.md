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

## Native Image Reading

The Pi runner exposes `read_image({ file_path: string })`, labeled `ReadImage`,
to inspect image files relative to `cwd` or by absolute path. It reuses Pi's
native image processing and resizing and returns an image content block.
Missing, unsupported, non-image, and damaged files return clear errors.

Explicit `allowedTools` lists must include `read_image`; allowing `read` alone
does not enable it. Existing tool approval, cancellation, and text redaction
apply. The original `read` tool remains available.

Both file reading and uploaded image prompts require the current model to
declare `image` input. Text-only models receive an explicit diagnostic rather
than silently losing images. Uploaded image labels and ordering are preserved,
and native images use Pi's existing session persistence when resuming.

Custom models registered dynamically retain the existing image capability
declaration. This is not verification of the remote model's vision support.
Existing bash/MCP OCR tools can still be used for text extraction or text-only
models; no OCR backend or automatic fallback is added.

### Image Verification

Build the runner CLI, daemon, SDK, and local sandbox before running the local
HTTP transport tests:

```sh
pnpm --filter @bunny-agent/runner-cli... --filter @bunny-agent/daemon... --filter @bunny-agent/sdk... --filter @bunny-agent/sandbox-local... build
pnpm --filter @bunny-agent/runner-cli exec vitest run src/__tests__/pi-read-image.e2e.test.ts
```

These tests inspect actual image bytes in model requests, including ordered
uploads and resumed history. They do not prove visual understanding. To enable
the live file and upload vision tests, provide `OPENAI_API_KEY` and run the same
test command with `BUNNY_AGENT_LIVE_IMAGE_E2E=1`. Optional `OPENAI_BASE_URL` and
`BUNNY_AGENT_LIVE_IMAGE_MODEL` select the endpoint and model (default:
`openai:gpt-4o-mini`). Live tests send generated images and incur model usage.

## Output

Produces AI SDK UI data stream (SSE) chunks.
