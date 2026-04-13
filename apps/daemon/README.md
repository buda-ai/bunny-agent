# @bunny-agent/daemon

Unified API gateway for sandbox containers. Runs **inside** the [sandock](~/Documents/kapps/apps/sandock) Next.js app — either embedded as a Next.js route handler (local/dev mode) or as a standalone process inside a sandbox container (production).

---

## Where this runs

```
~/Documents/kapps/apps/buda/        ← buda.im Next.js app
    app/api/daemon/[...path]/
        route.ts                    ← embeds @bunny-agent/daemon via createNextHandler()
                                       (local dev mode, no extra process)

sandbox container                   ← production
    bunny-agent-daemon :3080          ← standalone process
    (accessed via sandock.ai proxy)
```

The same `@bunny-agent/daemon` package works in both modes — Next.js embed for local development, standalone HTTP server for production containers.

### Bunny Agent container image (`vikadata/bunny-agent`)

The Dockerfiles under `docker/bunny-agent-claude/` (`Dockerfile`, `Dockerfile.local`, `Dockerfile.template`) install `@bunny-agent/daemon` and start **`bunny-agent-daemon`** in the background when the container starts (alongside the existing CDP / `bunny-agent` CLI setup). The HTTP API listens on **`0.0.0.0:3080`** by default (`EXPOSE 3080`). Override with `BUNNY_AGENT_DAEMON_HOST`, `BUNNY_AGENT_DAEMON_PORT`, and `BUNNY_AGENT_ROOT` if needed.

### Runner environment

`POST /api/coding/run` starts the runner with the daemon process **`process.env`**. Configure API keys and runner settings on the daemon (or container image env), not via per-request HTTP headers from `@bunny-agent/manager`.

---

## Architecture

### 1. Big Picture — How Buda talks to a sandbox

```
  buda.im
     │
     │  HTTPS
     ▼
  sandock.ai
  /api/v1/sandbox/http/proxy/{sandbox-id}/3080/
     │
     │  HTTP (proxied)
     ▼
┌─────────────────────────────────────────────────────┐
│           sandbox container                         │
│                                                     │
│   ┌────────────────────────────────────┐            │
│   │       bunny-agent-daemon :3080       │            │
│   │       (unified API gateway)        │            │
│   └────────────────────────────────────┘            │
│                                                     │
│   chromium :9223 (internal) --remote-allow-origins=*│
│   nginx :9222 → :9223  (rewrites Host: localhost)   │
└─────────────────────────────────────────────────────┘
```

External callers only ever see **one port: 3080**. Everything else is internal.

---

### 2. Inside the daemon — request routing

```
incoming HTTP request
        │
        ▼
┌───────────────────────────────────────────────────────┐
│                  bunny-agent-daemon                     │
│                                                       │
│  POST /api/coding/run  ──────────────────────────┐ │
│                                                     │ │
│  GET|POST /api/fs/*   ──────────────────────────┐  │ │
│  GET|POST /api/git/*  ──────────────────────┐   │  │ │
│  GET|POST /api/volumes/*  ──────────────┐   │   │  │ │
│  GET /healthz  ─────────────────────┐   │   │   │  │ │
│                                     │   │   │   │  │ │
│                                     ▼   ▼   ▼   │  │ │
│                               ┌─────────────┐   │  │ │
│                               │ DaemonRouter│   │  │ │
│                               │ (core logic)│   │  │ │
│                               └──────┬──────┘   │  │ │
│                                      │          │  │ │
│              ┌───────────────────────┤          │  │ │
│              ▼                       ▼          ▼  │ │
│         node:fs/promises        spawn git      SSE │ │
│         (file ops)              (git CLI)   stream │ │
│                                                    │ │
│                                    @bunny-agent/     │ │
│                                    runner-core ◄───┘ │
│                                    claude/pi/        │
│                                    gemini/codex      │
└───────────────────────────────────────────────────────┘
```

---

### 3. Package dependency graph

```
packages/
│
├── runner-claude   ──┐
├── runner-codex    ──┤
├── runner-gemini   ──┼──► runner-core ◄──┬── apps/runner-cli
├── runner-pi       ──┤                   │
└── runner-opencode ──┘                   └── apps/bunny-agent-daemon
```

`runner-core` is the shared dispatch layer — no I/O, no stdout, just `createRunner() → AsyncIterable<string>`.

---

### 4. Deployment modes

```
┌──────────────────────────────────────────────────────────────────┐
│  Mode A: Standalone process (container / local)                  │
│                                                                  │
│  entrypoint.sh                                                   │
│  ├── chromium :9223 (internal) --remote-allow-origins=* &        │
│  ├── nginx :9222 → :9223 (rewrites Host: localhost) &            │
│  └── bunny-agent-daemon          ← node process, listens :3080     │
│                                                                  │
│  caller: curl / Buda SDK / any HTTP client                       │
│  → http://sandbox:3080/api/fs/read?path=file.txt                 │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Mode B: Embedded in Next.js (local dev / sandock-cli)           │
│                                                                  │
│  app/api/daemon/[...path]/route.ts                               │
│  └── createNextHandler({ root: process.cwd() })                  │
│                                                                  │
│  No extra process. DaemonRouter runs inside Next.js.             │
│  caller: browser / fetch                                         │
│  → /api/daemon/fs/read?path=file.txt                             │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Mode C: runner-cli (local terminal, no daemon needed)           │
│                                                                  │
│  bunny-agent run --runner claude -- "Build a REST API"             │
│  └── runner-core → stdout (AI SDK UI NDJSON stream)              │
│                                                                  │
│  Runs directly on local filesystem. No HTTP server.              │
└──────────────────────────────────────────────────────────────────┘
```

---

### 5. Internal code structure

```
apps/bunny-agent-daemon/
├── src/
│   ├── cli.ts          entry point — reads env, starts http.Server
│   ├── server.ts       createDaemon() — http.Server wrapping DaemonRouter
│   ├── router.ts       DaemonRouter — framework-agnostic route table
│   ├── nextjs.ts       createNextHandler() — Next.js adapter
│   ├── utils.ts        path safety, ApiEnvelope helpers
│   └── routes/
│       ├── health.ts   GET /healthz
│       ├── fs.ts       GET|POST /api/fs/*
│       ├── volumes.ts  GET|POST /api/volumes/*
│       ├── git.ts      POST /api/git/*  (spawns git CLI)
│       └── coding.ts POST /api/coding/run  (SSE, uses runner-core)
└── src/__tests__/
    └── daemon.test.ts  13 integration tests (no mocks, real fs + git)
```

---

## Usage

### Option A: runner-cli (local terminal)

```bash
cd templates/coder
npx bunny-agent run -- "Build a REST API"
npx bunny-agent run --runner pi -- "Analyze this dataset"
npx bunny-agent run --runner gemini --model gemini-2.0-flash -- "Review my code"
npx bunny-agent run --resume <session-id> -- "Continue"
```

Output: raw AI SDK UI NDJSON stream to stdout.

### Option B: daemon standalone (container)

```bash
# see docs/entrypoint.example.sh for the full script
#
# Chromium runs on internal port 9223 with --remote-allow-origins=* so
# the WebSocket origin check passes. nginx proxies 0.0.0.0:9222 → 9223
# and rewrites the Host header to "localhost" to satisfy Chromium's
# DNS-rebinding security check. Without this rewrite, external clients
# (Host: container-ip:9222) are rejected even when the port is open.
chromium --headless --no-sandbox \
  --remote-debugging-port=9223 \
  --remote-allow-origins=* &
nginx  # proxies :9222 → :9223 with Host rewrite
exec bunny-agent-daemon
```

```bash
# Run an agent — SSE stream
curl -N -X POST http://localhost:3080/api/coding/run \
  -H 'Content-Type: application/json' \
  -d '{"runner":"claude","userInput":"List files in /workspace"}'

# File ops
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

```ts
// app/api/daemon/[...path]/route.ts
import { createNextHandler } from "@bunny-agent/daemon/nextjs";

const handler = createNextHandler({ root: process.cwd() });
export const GET = handler;
export const POST = handler;
```

Covers `/api/fs/*`, `/api/git/*`, `/api/volumes/*` at `/api/daemon/*`. No extra process.

### Option D: just run an agent directly (no daemon needed)

If you only need to run an agent — no file API, no HTTP server — use `runner-core` directly:

```ts
import { createRunner } from "@bunny-agent/runner-core";

const stream = createRunner({
  runner: "claude",           // or "pi", "gemini", "codex", "opencode"
  model: "claude-sonnet-4-20250514",
  userInput: "Build a REST API",
  cwd: "/workspace",
  env: process.env as Record<string, string>,
});

// Collect all chunks into a full response
const chunks: string[] = [];
for await (const chunk of stream) {
  chunks.push(chunk);
}
const fullResponse = chunks.join("");

// Or parse each NDJSON line as it arrives
for await (const chunk of stream) {
  for (const line of chunk.split("\n").filter(Boolean)) {
    const msg = JSON.parse(line);
    console.log(msg);
  }
}
```

`runner-core` is the shared core used by both `runner-cli` and `bunny-agent-daemon`. Use it directly when you don't need the HTTP gateway.

---

## API Reference

All JSON responses: `{ "ok": true, "data": {}, "error": null }`

### Agent `/api/coding/*`

#### `POST /api/coding/run`

Run an agent and stream the output as SSE (AI SDK UI NDJSON format).

Request body:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `userInput` | string | required | The task / prompt |
| `runner` | string | `"claude"` | `claude` · `codex` · `gemini` · `pi` · `opencode` |
| `model` | string | `"claude-sonnet-4-20250514"` | Model name for the runner |
| `cwd` | string | `BUNNY_AGENT_ROOT` | Working directory inside the sandbox |
| `systemPrompt` | string | — | Override system prompt |
| `maxTurns` | number | — | Max agent turns |
| `allowedTools` | string[] | — | Restrict which tools the agent can use |
| `resume` | string | — | Session ID to resume |
| `skillPaths` | string[] | — | Extra skill paths (pi runner) |

Example:

```bash
# Stream with curl (-N disables buffering)
curl -N -X POST http://localhost:3080/api/coding/run \
  -H 'Content-Type: application/json' \
  -d '{
    "runner": "claude",
    "userInput": "List all TypeScript files and summarize what each does",
    "cwd": "/workspace/myproject"
  }'

# Use pi runner with a different model
curl -N -X POST http://localhost:3080/api/coding/run \
  -H 'Content-Type: application/json' \
  -d '{
    "runner": "pi",
    "model": "gemini-2.0-flash",
    "userInput": "Refactor this codebase to use async/await"
  }'
```

Response: `application/x-ndjson` chunked stream — each line is an AI SDK UI message, compatible with Vercel AI SDK `useChat` / `streamText`.

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
| POST | `/api/fs/upload` | `multipart/form-data` — see below |

#### `POST /api/fs/upload`

Upload one or more files via `multipart/form-data`.

Form fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | No | Target directory (default: `.`) |
| `volume` | string | No | Volume name for multi-tenant isolation |
| `create_dirs` | string | No | Create parent dirs (default: `"true"`) |
| `file` | file | Yes | One or more files to upload |

Example:

```bash
# Upload a single file
curl -X POST http://localhost:3080/api/fs/upload \
  -F "path=uploads" \
  -F "file=@local-file.txt"

# Upload multiple files
curl -X POST http://localhost:3080/api/fs/upload \
  -F "path=data" \
  -F "file=@report.csv" \
  -F "file=@image.png"

# Upload to a specific volume
curl -X POST http://localhost:3080/api/fs/upload \
  -F "path=docs" \
  -F "volume=vol-001" \
  -F "file=@readme.md"
```

Response:

```json
{
  "ok": true,
  "data": {
    "files": [
      { "fieldname": "file", "filename": "report.csv", "path": "/workspace/data/report.csv", "size": 1234 }
    ]
  },
  "error": null
}
```

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
| `BUNNY_AGENT_DAEMON_PORT` | `3080` | Listen port |
| `BUNNY_AGENT_ROOT` | `./.bunny-agent-daemon` (under cwd) | Daemon filesystem root; Docker images set e.g. `/workspace` |
| `ANTHROPIC_API_KEY` | — | For claude runner |
| `GEMINI_API_KEY` | — | For gemini / pi runner |
| `OPENAI_API_KEY` | — | For codex runner |

---

## Development

```bash
cd apps/bunny-agent-daemon
pnpm install && pnpm build

BUNNY_AGENT_ROOT=/tmp/test bunny-agent-daemon
curl http://localhost:3080/healthz

pnpm test   # 13 integration tests
```
