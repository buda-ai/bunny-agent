# SandAgent Claude Image

Docker image with **Claude Agent SDK** and `@sandagent/runner-cli` for Daytona, E2B, and Sandock.

Bundle everything needed to run a Claude agent (Claude Agent SDK + runner-cli + templates) into an image/template for faster, consistent sandbox startup.

> Note: this is a build/deploy project (`"private": true`) and is not published to npm. Use it inside this repo.

## Quick start

```bash
# Install deps (once)
pnpm install

# Show all commands
make help
```

### Docker image (generic)

Image name: **vikadata/sandagent**. No template = default; with template = **vikadata/sandagent-&lt;templateName&gt;** (e.g. `vikadata/sandagent-researcher`).

```bash
make image                        # build vikadata/sandagent:0.1.0
make image TEMPLATE=researcher    # build vikadata/sandagent-researcher:0.1.0
make image-push                   # build + push (docker login first)
```

Or with pnpm:

```bash
pnpm run image
pnpm run image -- --push
pnpm run image -- --template researcher --push
pnpm run image -- --tag 0.2.0 --push
pnpm run image -- --help
```

### Daytona

```bash
make daytona
make daytona TEMPLATE=researcher
```

Requires: `daytona` CLI, `DAYTONA_API_KEY` in `.env`.

### E2B

```bash
make e2b
make e2b TEMPLATE=researcher CPU=4 MEMORY=8
```

Requires: `E2B_API_KEY` in `.env`.

### Local build (no push)

```bash
make build
make build TEMPLATE=coder
```

Uses `IMAGE_NAME` / `IMAGE_TAG` from `.env` or defaults (see `make help`).

### Build from local monorepo (no npm publish)

Use when you changed `runner-claude` or `runner-cli` and want an image with your code without publishing to npm. Build context = repo root; uses `Dockerfile.local`.

```bash
cd docker/sandagent-claude
make image-local              # build vikadata/sandagent:0.1.0 (or IMAGE_TAG from .env)
make image-local IMAGE_TAG=local
make image-local-push          # build + push (docker login first)
```

Or from repo root:

```bash
docker build -f docker/sandagent-claude/Dockerfile.local -t vikadata/sandagent:local .
```

## Setup

1. Copy `.env.example` to `.env`.
2. Set keys: `DAYTONA_API_KEY`, `E2B_API_KEY` (and `DOCKERHUB_USERNAME` if pushing Sandock under another account).

## Make targets

| Target               | Description                                      |
|----------------------|--------------------------------------------------|
| `make help`          | Show all options                                 |
| `make image`         | Build image (npm packages)                       |
| `make image-local`   | Build from local monorepo (Dockerfile.local)      |
| `make image-local-push` | Build image-local + push to Docker Hub        |
| `make image-push`    | Build image + push to Docker Hub                  |
| `make build`         | Build local image                                |
| `make daytona`   | Build + deploy to Daytona      |
| `make e2b`       | Deploy to E2B                  |
| `make clean`     | Remove local image             |

## pnpm scripts

| Script            | Description              |
|-------------------|--------------------------|
| `pnpm run image`  | Build Docker image (tsx) |
| `pnpm run daytona`| Daytona snapshot (tsx)   |
| `pnpm run e2b`     | E2B template (tsx)       |

## Image naming

Unified name: **vikadata/sandagent** (set in Makefile and build-image.ts; override with `.env` or `IMAGE_NAME`). No template → `vikadata/sandagent:tag`. With template → `vikadata/sandagent-&lt;name&gt;:tag` (e.g. `vikadata/sandagent-researcher:0.1.0`).

## Templates

Include a template (e.g. researcher, coder) in the image:

```bash
make build TEMPLATE=researcher
make daytona TEMPLATE=researcher
make e2b TEMPLATE=coder
```

Templates live under `../../templates/`; `generate-dockerfile.sh` copies `.claude/` and `CLAUDE.md` into the image.

## Use in SDK

**Sandock**

```typescript
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const sandbox = new SandockSandbox({
  image: "vikadata/sandagent:0.1.0",
  // with template: "vikadata/sandagent-researcher:0.1.0"
  // ...
});
```

**Daytona**

```typescript
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";

const sandbox = new DaytonaSandbox({
  snapshot: "sandagent-claude:0.1.0",
  // ...
});
```

**E2B**

```typescript
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const sandbox = new E2BSandbox({
  template: "sandagent-claude",
  // ...
});
```
