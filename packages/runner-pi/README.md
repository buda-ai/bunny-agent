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

## Session Images and Recovery

Pi sessions store image blocks as SHA-256 references in JSONL. The exact base64
payloads live in a private sibling `.media/<sha256>.base64` directory, shared by
sessions in that directory. Repeated images reuse one file. Images are restored
and checksum-checked before Pi uses the session, so provider requests still carry
real image data. Both user attachments and image tool results use this storage.
Debug event traces omit image data as well.

Resume and fork first migrate legacy inline-image JSONL one bounded line at a
time. Migration preserves the session ID, entry IDs, parent links, compaction
entries, user instructions and tool results. A successful migration keeps the
original file as a hard-link backup named `<session>.pre-media-<id>.bak` and
atomically replaces the active JSONL. Forks get a new session ID and copy their
media into the destination's `.media` directory. Existing backup files are not
scanned as active sessions.

The metadata limit `SANDAGENT_MAX_SESSION_BYTES` defaults to 10 MiB after image
externalization. Legacy input lines are limited to 64 MiB. Restoring a session preflights a
64 MiB image-data budget, counting repeated blocks before allocating their data;
`SANDAGENT_MAX_SESSION_MEDIA_BYTES` accepts a positive integer override. A blob
also cannot exceed that budget. Raising either limit requires sufficient runtime
memory. Invalid JSON, missing
or corrupt media, and remaining oversized metadata produce explicit errors;
they never start a replacement session seeded with an incomplete conversation
tail. The source JSONL remains intact on migration failure. Completed media
writes can remain unreferenced if migration is interrupted or rejected.

**Backup and deployment:** keep `.media` together with its referencing JSONL
files. Do not delete media when deleting one session: other sessions may share
it. There is no automatic media or backup garbage collection. Older Bunny/Pi
versions cannot read the new references; use the retained inline backup when
rolling back an already migrated session. Deploy the updated runner before
resuming migrated sessions. This adapter is bundled with Bunny and does not
require consumer installations to apply workspace pnpm patches. It checks the
persistence layout of the pinned Pi 1.3 dependency and must be revalidated when
upgrading Pi.

Images are still hydrated into Pi's in-memory history; this change does not make
arbitrary image history free of memory cost or increase a model's context window.
This storage repair also does not establish that a model will follow image-related
instructions correctly.
