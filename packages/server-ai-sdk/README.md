# @bunny-agent/server-ai-sdk

Serves BunnyAgent runner output over HTTP as the AI SDK UI stream protocol
(SSE-framed `data: {...}\n\n` lines, NDJSON content type) — the wire format
consumed by `@bunny-agent/sdk`'s `BunnyAgentLanguageModel` and, generally,
any Vercel AI SDK `useChat`/`streamText` client.

Extracted from `apps/daemon/src/routes/coding.ts`, which previously
duplicated this logic across its Node `http.ServerResponse` and Next.js
`Response` entry points. Both now share one `codingRunChunks()` core.

For the ACP (editor) protocol instead, see `@bunny-agent/server-acp`.

## Usage

```ts
import { createAiSdkCodingRunServer } from "@bunny-agent/server-ai-sdk";

const server = createAiSdkCodingRunServer({
  prepareEnv: () => ({
    env: process.env as Record<string, string>,
    systemEnv: process.env as Record<string, string>,
  }),
});

// server.handleNodeHttp: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
// server.handleWebRequest: (req: Request) => Promise<Response>
// server.mountPath: "/api/coding/run" by default
```

Request body follows the daemon's `RunRequest` shape (`runner`, `model`,
`userInput`/`input`, `cwd`, `systemPrompt`, `allowedTools`, `resume`, ...) —
see [`apps/daemon/README.md`](../../apps/daemon/README.md#post-apicodingrun)
for the full field reference.

## Behavior

- Validates the request body (`assertRunRequestInput`) before starting the
  runner; missing/invalid input returns 400 on the Web transport rather than
  starting an empty stream.
- Streams `RunnerChunk`s straight through with no re-serialization.
- On a runner-side failure, emits the same SSE error envelope as the
  existing daemon behavior (`error` → `finish` → `[DONE]`) so SDK clients
  parse errors uniformly regardless of transport.
- Sends periodic SSE heartbeat comments (`: heartbeat\n\n`) to keep
  long-running streams alive through idle-timeout proxies.
