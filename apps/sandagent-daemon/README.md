# @sandagent/daemon

Unified API gateway that runs inside a sandbox container. Single entry point for file operations, git, and agent execution.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    @sandagent/runner-core                    │
│   createRunner(options) → AsyncIterable<string>             │
│   Supports: claude · codex · gemini · pi · opencode         │
└──────────────────────┬──────────────────────────────────────┘
                       │ shared by
          ┌────────────┴────────────┐
          ▼                         ▼
┌─────────────────┐       ┌──────────────────────┐
│  runner-cli     │       │  sandagent-daemon     │
│  (local CLI)    │       │  (container gateway)  │
│                 │       │                       │
│  stdout stream  │       │  HTTP :3080           │
│  SIGINT/SIGTERM │       │  /api/sandagent/run   │
│  handling       │       │  SSE stream           │
└─────────────────┘       └──────────┬────────────┘
                                     │
                          ┌──────────┼──────────┐
                          ▼          ▼          ▼
                      /api/fs/*  /api/git/*  /api/volumes/*
                      (built-in) (built-in)  (built-in)
```

### How it fits together

- **`runner-core`** — pure dispatch logic, no I/O. Both runner-cli and daemon share it.
- **`runner-cli`** — local terminal use. Writes chunks to stdout, handles signals.
- **`sandagent-daemon`** — runs inside the sandbox container. Exposes everything over HTTP.

External callers (e.g. Buda) go through sandock.ai's proxy to reach the daemon:

```
buda.im → sandock.ai/api/v1/sandbox/http/proxy/{id}/3080/ → sandagent-daemon:3080
```

---

## Usage

### Option A: runner-cli (local)

Run an agent directly in your terminal against your local filesystem:

```bash
cd templates/coder
npx sandagent run -- "Build a REST API"

# Choose runner
npx sandagent run --runner pi -- "Analyze this dataset"
npx sandagent run --runner gemini --model gemini-2.0-flash -- "Review my code"

# Resume a session
npx sandagent run --resume <session-id> -- "Continue where we left off"
```

Output is a raw AI SDK UI stream (NDJSON) written to stdout.

### Option B: daemon standalone (container)

Run the daemon as a standalone HTTP server inside a container:

```bash
# Container entrypoint (see docs/entrypoint.example.sh)
chromium --headless --no-sandbox --remote-debugging-port=9222 &
exec sandagent-daemon
```

Then call it over HTTP:

```bash
# Run an agent (SSE stream)
curl -N -X POST http://localhost:3080/api/sandagent/run \
  -H 'Content-Type: application/json' \
  -d '{"runner":"claude","userInput":"List files in /workspace"}'

# File operations
curl -X POST http://localhost:3080/api/fs/write \
  -H 'Content-Type: application/json' \
  -d '{"path":"hello.txt","content":"hello world"}'

curl "http://localhost:3080/api/fs/read?path=hello.txt"

# Git
curl -X POST http://localhost:3080/api/git/clone \
  -H 'Content-Type: application/json' \
  -d '{"repo_parent":".","url":"https://github.com/user/repo","depth":1}'
```

### Option C: embed in Next.js

No extra process needed. Import directly into a Next.js route handler:

```ts
// app/api/daemon/[...path]/route.ts
import { createNextHandler } from "@sandagent/daemon/nextjs";

const handler = createNextHandler({ root: process.cwd() });
export const GET = handler;
export const POST = handler;
```

Covers all `/api/fs/*`, `/api/git/*`, `/api/volumes/*` endpoints at `/api/daemon/*`.

For the streaming agent endpoint, wire it separately:

```ts
// app/api/daemon/sandagent/run/route.ts
import { DaemonRouter } from "@sandagent/daemon";
import { sandagentRun } from "@sandagent/daemon/sandagent";

export async function POST(req: Request) {
  const body = await req.json();
  const stream = new ReadableStream({
    async start(controller) {
      // pipe sandagentRun output into the stream
    }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}
```

### Option D: programmatic (SDK)

```ts
import { createDaemon } from "@sandagent/daemon";

const server = createDaemon({ host: "0.0.0.0", port: 3080, root: "/workspace" });
server.listen(3080);
```

---

## API Reference

All JSON responses: `{ "ok": true, "data": {}, "error": null }`

### Agent

| Method | Path | Body |
|--------|------|------|
| POST | `/api/sandagent/run` | `{"runner":"claude","userInput":"...","model":"...","cwd":"..."}` |

Response: SSE stream of AI SDK UI NDJSON chunks.

Supported runners: `claude` · `codex` · `gemini` · `pi` · `opencode`

### Filesystem `/api/fs/*`

| Method | Path | Params |
|--------|------|--------|
| GET | `/api/fs/list` | `?path=src&volume=vol-001` |
| GET | `/api/fs/read` | `?path=file.txt` |
| GET | `/api/fs/stat` | `?path=file.txt` |
| GET | `/api/fs/exists` | `?path=file.txt` |
| GET | `/api/fs/find` | `?pattern=todo&limit=100` |
| POST | `/api/fs/write` | `{"path":"a.txt","content":"hello"}` |
| POST | `/api/fs/append` | `{"path":"log.txt","content":"line\n"}` |
| POST | `/api/fs/mkdir` | `{"path":"a/b/c"}` |
| POST | `/api/fs/remove` | `{"path":"tmp","recursive":true}` |
| POST | `/api/fs/move` | `{"from":"a.txt","to":"b.txt"}` |
| POST | `/api/fs/copy` | `{"from":"a.txt","to":"b.txt"}` |

All fs endpoints accept optional `volume` for multi-tenant isolation.

### Git `/api/git/*`

| Method | Path | Body |
|--------|------|------|
| POST | `/api/git/status` | `{"repo":"myrepo"}` |
| POST | `/api/git/exec` | `{"repo":"myrepo","args":["log","--oneline"]}` |
| POST | `/api/git/clone` | `{"repo_parent":".","url":"https://...","depth":1}` |
| POST | `/api/git/init` | `{"repo":"myrepo","initial_branch":"main"}` |

### Volumes `/api/volumes/*`

| Method | Path | Body |
|--------|------|------|
| GET | `/api/volumes/list` | |
| POST | `/api/volumes/ensure` | `{"volume":"vol-001"}` |
| POST | `/api/volumes/remove` | `{"volume":"vol-001"}` |

### Health

```
GET /healthz
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SANDAGENT_DAEMON_PORT` | `3080` | Listen port |
| `SANDAGENT_ROOT` | `/workspace` | Filesystem root |
| `ANTHROPIC_API_KEY` | — | For claude runner |
| `GEMINI_API_KEY` | — | For gemini/pi runner |
| `OPENAI_API_KEY` | — | For codex runner |

---

## Development

```bash
cd apps/sandagent-daemon
pnpm install && pnpm build

SANDAGENT_ROOT=/tmp/test sandagent-daemon
curl http://localhost:3080/healthz
```
