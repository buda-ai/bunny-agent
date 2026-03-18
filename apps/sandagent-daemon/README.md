# @sandagent/daemon

Unified API gateway for sandbox containers. It exposes a single daemon process on port `3080` and replaces the earlier `sandock-daemon`.

## Architecture

```text
buda.im -> sandock.ai proxy -> sandbox:3080 (sandagent-daemon)
                                    |
                      +-------------+-------------+
                      |             |             |
                  /api/fs/*     /api/git/*   /api/volumes/*
                  /healthz
```

## Usage

### Option A: Run as a standalone process inside the container

```bash
# /usr/local/bin/entrypoint.sh
chromium --headless --no-sandbox --remote-debugging-port=9222 &
exec sandagent-daemon
```

### Option B: Embed in Next.js for local development

```ts
// app/api/daemon/[...path]/route.ts
import { createNextHandler } from "@sandagent/daemon/nextjs";

const handler = createNextHandler({ root: process.cwd() });

export const GET = handler;
export const POST = handler;
```

## API

All responses use the same envelope: `{ "ok": true, "data": {}, "error": null }`

### `/api/fs/*`

| Method | Path | Params |
|------|------|------|
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

All filesystem endpoints support an optional `volume` parameter for tenant isolation.

### `/api/git/*`

| Method | Path | Params |
|------|------|------|
| POST | `/api/git/status` | `{"repo":"myrepo"}` |
| POST | `/api/git/exec` | `{"repo":"myrepo","args":["log","--oneline"]}` |
| POST | `/api/git/clone` | `{"repo_parent":".","url":"https://...","depth":1}` |
| POST | `/api/git/init` | `{"repo":"myrepo","initial_branch":"main"}` |

### `/api/volumes/*`

| Method | Path | Params |
|------|------|------|
| GET | `/api/volumes/list` | |
| POST | `/api/volumes/ensure` | `{"volume":"vol-001"}` |
| POST | `/api/volumes/remove` | `{"volume":"vol-001"}` |

## Environment Variables

| Variable | Default | Description |
|------|--------|------|
| `SANDAGENT_DAEMON_PORT` | `3080` | Listening port |
| `SANDAGENT_ROOT` | `/workspace` | Filesystem root |

## Development

```bash
cd apps/sandagent-daemon
pnpm install && pnpm build

SANDAGENT_ROOT=/tmp/test sandagent-daemon
curl http://localhost:3080/healthz
```
