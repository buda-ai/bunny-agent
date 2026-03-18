# @sandagent/daemon

Unified API gateway for sandbox containers. Runs **inside** the [sandock](~/Documents/kapps/apps/sandock) Next.js app — either embedded as a Next.js route handler (local/dev mode) or as a standalone process inside a sandbox container (production).

---

## Where this runs

```
~/Documents/kapps/apps/buda/        ← buda.im Next.js app
    app/api/daemon/[...path]/
        route.ts                    ← embeds @sandagent/daemon via createNextHandler()
                                       (local dev mode, no extra process)

sandbox container                   ← production
    sandagent-daemon :3080          ← standalone process
    (accessed via sandock.ai proxy)
```

The same `@sandagent/daemon` package works in both modes — Next.js embed for local development, standalone HTTP server for production containers.

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
│   │       sandagent-daemon :3080       │            │
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
│                  sandagent-daemon                     │
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
│                                    @sandagent/     │ │
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
└── runner-opencode ──┘                   └── apps/sandagent-daemon
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
│  └── sandagent-daemon          ← node process, listens :3080     │
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
│  sandagent run --runner claude -- "Build a REST API"             │
│  └── runner-core → stdout (AI SDK UI NDJSON stream)              │
│                                                                  │
│  Runs directly on local filesystem. No HTTP server.              │
└──────────────────────────────────────────────────────────────────┘
```

---

### 5. Internal code structure

```
apps/sandagent-daemon/
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
npx sandagent run -- "Build a REST API"
npx sandagent run --runner pi -- "Analyze this dataset"
npx sandagent run --runner gemini --model gemini-2.0-flash -- "Review my code"
npx sandagent run --resume <session-id> -- "Continue"
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
exec sandagent-daemon
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
import { createNextHandler } from "@sandagent/daemon/nextjs";

const handler = createNextHandler({ root: process.cwd() });
export const GET = handler;
export const POST = handler;
```

Covers `/api/fs/*`, `/api/git/*`, `/api/volumes/*` at `/api/daemon/*`. No extra process.

### Option D: just run an agent directly (no daemon needed)

If you only need to run an agent — no file API, no HTTP server — use `runner-core` directly:

```ts
import { createRunner } from "@sandagent/runner-core";

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

`runner-core` is the shared core used by both `runner-cli` and `sandagent-daemon`. Use it directly when you don't need the HTTP gateway.

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
| `cwd` | string | `SANDAGENT_ROOT` | Working directory inside the sandbox |
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
| `GEMINI_API_KEY` | — | For gemini / pi runner |
| `OPENAI_API_KEY` | — | For codex runner |

---

## Development

```bash
cd apps/sandagent-daemon
pnpm install && pnpm build

SANDAGENT_ROOT=/tmp/test sandagent-daemon
curl http://localhost:3080/healthz

pnpm test   # 13 integration tests
```
