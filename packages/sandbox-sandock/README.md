# @sandagent/sandbox-sandock

Sandock sandbox adapter for SandAgent. Runs AI agents in [Sandock](https://sandock.ai) remote sandboxes (instead of locally or via E2B/Daytona), with persistent volumes, seed-file uploads, and fast-start images.

## Prerequisites

- Node.js 20+
- [Sandock API Key](https://sandock.ai) (env: `SANDOCK_API_KEY`)

## Install

```bash
npm install @sandagent/sandbox-sandock
```

## Quick Start

```ts
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const sandbox = new SandockSandbox({
  apiKey: process.env.SANDOCK_API_KEY,
  workdir: "/workspace",
  image: "vikadata/sandagent:latest",
  skipBootstrap: true,
});
```

## Key Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | string | `SANDOCK_API_KEY` | Sandock API key |
| `image` | string | `sandockai/sandock-code:latest` | Container image |
| `workdir` | string | `/workspace` | Working directory inside the sandbox |
| `templatesPath` | string | - | Local directory of files to seed the workspace; contents are uploaded to workdir on attach (e.g. project skeleton, configs) |
| `volumes` | `{ volumeName, volumeMountPath }[]` | `[]` | Persistent volumes; created or reused by name |
| `skipBootstrap` | boolean | false | If true, skip runner install; image must include runner |
| `env` | Record<string, string> | `{}` | Environment variables injected into the sandbox |
| `timeout` | number | 300000 | Operation timeout in milliseconds |
| `sandboxId` | string | - | Existing sandbox ID to reattach to; falls back to creating new on failure |
| `name` | string | - | Sandbox display name (e.g. for Sandock dashboard) |
| `keep` | boolean | true | Keep sandbox running after execution |

## Usage Patterns

### 1. Minimal (Pre-built Image)

```ts
new SandockSandbox({
  apiKey: process.env.SANDOCK_API_KEY,
  image: "vikadata/sandagent:latest",
  skipBootstrap: true,
  workdir: "/workspace",
});
```

### 2. With Persistent Volumes

```ts
new SandockSandbox({
  apiKey: process.env.SANDOCK_API_KEY,
  image: "vikadata/sandagent:latest",
  skipBootstrap: true,
  workdir: "/workspace",
  volumes: [
    { volumeName: "my-workspace", volumeMountPath: "/workspace" },
    { volumeName: "my-session", volumeMountPath: "/root/.claude" },
  ],
});
```

### 3. Reuse Existing Sandbox

Pass `sandboxId` to reattach to a previously created sandbox. The adapter will only reattach if the sandbox is currently in `RUNNING` state. If the sandbox is stopped, paused, or no longer exists, `attach()` falls back to creating a new one automatically.

```ts
const sandbox = new SandockSandbox({
  apiKey: process.env.SANDOCK_API_KEY,
  image: "vikadata/sandagent:latest",
  skipBootstrap: true,
  workdir: "/workspace",
  sandboxId: "cached-sandbox-id", // from your cache
});

const handle = await sandbox.attach();
// Store handle.getSandboxId() for next request
```

> **Note:** The adapter does not attempt to start a stopped sandbox. Only `RUNNING` sandboxes are reused. This avoids unexpected cold-start delays and ensures a consistent attach experience.

For web apps, cache the sandboxId server-side (e.g. in-memory Map with 30-min TTL) so subsequent requests reuse the same sandbox without client-side state. Use `keep: true` (the default) to keep sandboxes running between requests.

## With @sandagent/sdk

```ts
import { createSandAgent } from "@sandagent/sdk";
import { SandockSandbox } from "@sandagent/sandbox-sandock";
import { generateText } from "ai";

const sandagent = createSandAgent({
  sandbox: new SandockSandbox({
    apiKey: process.env.SANDOCK_API_KEY,
    workdir: "/workspace",
    image: "vikadata/sandagent:latest",
    skipBootstrap: true,
  }),
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
});

const { text } = await generateText({
  model: sandagent("sonnet"),
  prompt: "Create a hello world program",
});
```

Install: `npm install @sandagent/sandbox-sandock @sandagent/sdk ai`

## API

### SandockSandbox (Adapter)

- `attach()` — Create or reuse a sandbox; returns a `SandboxHandle`
- `getHandle()` — Returns the current handle if attached, otherwise `null`

### SandboxHandle (returned by `attach()`)

- `getSandboxId()` — Returns the sandbox instance ID
- `getVolumes()` — Returns mounted volume list (or `null`)
- `getWorkdir()` — Returns the working directory
- `exec(command, opts)` — Execute a command and stream output
- `upload(files, targetDir)` — Upload files to the sandbox
- `readFile(filePath)` — Read a file from the sandbox
- `destroy()` — Stop and delete the sandbox

## About skipBootstrap

- **`skipBootstrap: true`**: Image already includes `sandagent run`; only upload seed files (from `templatesPath`), no runner install. Use with pre-built images like `vikadata/sandagent:latest`.
- **`skipBootstrap: false`**: On attach, runs `npm install @sandagent/runner-cli@latest` in `workdir`, then uses `${workdir}/node_modules/.bin/sandagent run` for execution.

## License

Apache-2.0
