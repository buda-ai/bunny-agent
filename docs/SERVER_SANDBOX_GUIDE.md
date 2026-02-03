# Server Sandbox Architecture Guide

This guide explains the server-side sandbox architecture and how to integrate cloud sandboxes in production. For template deployment details, see `docs/DEPLOY_CUSTOM_TEMPLATE.md`. For reuse and persistence strategies, see `docs/SANDBOX_REUSE.md`.

## Why Server Sandboxes

| Aspect | LocalSandbox | Server Sandbox (E2B / Daytona / Sandock) |
|------|------|------|
| Isolation | Local process | Isolated containers |
| Access to user code | Possible | Fully isolated |
| Resource control | Shared | Dedicated CPU/memory |
| Persistence | Local filesystem | Volume or platform-managed |
| Best for | Development | Production |

## High-Level Architecture

```mermaid
flowchart TB
  subgraph client [Client]
    UI[Web UI / CLI]
  end

  subgraph server [Server]
    API[Next.js API]
    SDK[SandAgent SDK]
    Adapter[Sandbox Adapter]
  end

  subgraph sandbox [Cloud Sandbox]
    Runner[sandagent CLI]
    Claude[Claude Agent SDK]
    Workspace[/workspace]
  end

  UI -->|HTTP Stream| API
  API --> SDK
  SDK --> Adapter
  Adapter -->|exec| Runner
  Runner --> Claude
  Claude -->|File I/O| Workspace

  style sandbox fill:#e1f5fe
  style server fill:#fff3e0
  style client fill:#f3e5f5
```

## Supported Providers

All providers implement the same `SandboxAdapter` contract.

### E2B

```typescript
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const sandbox = new E2BSandbox({
  template: "sandagent-claude-researcher",
  timeout: 3600,
  name: "my-agent",
  workdir: "/workspace",
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
});
```

### Daytona

```typescript
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";

const sandbox = new DaytonaSandbox({
  snapshot: "sandagent-claude-researcher:0.1.0",
  name: "my-agent",
  volumeName: "my-agent-volume",
  autoStopInterval: 15,
  workdir: "/workspace",
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
});
```

### Sandock

```typescript
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const sandbox = new SandockSandbox({
  image: "sandockai/sandock-code:latest",
  memoryLimitMb: 2048,
  cpuShares: 2,
  workdir: "/workspace",
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
});
```

## Docker Image Packaging (Overview)

The prebuilt image lives under `docker/sandagent-claude/` and includes:

- Node.js 20
- `@anthropic-ai/claude-agent-sdk`
- `@sandagent/runner-cli`
- Common CLI tools

For full build and deploy steps, see:

- `docs/DEPLOY_CUSTOM_TEMPLATE.md`
- `docker/sandagent-claude/README.md`

## SDK Integration Example

```typescript
import { createSandAgent } from "@sandagent/sdk";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { streamText } from "ai";

const sandbox = new E2BSandbox({
  template: "sandagent-claude-researcher",
  workdir: "/workspace",
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
});

const sandagent = createSandAgent({ sandbox });

const result = streamText({
  model: sandagent("claude-sonnet-4-20250514"),
  prompt: "Write a Python crawler and run it",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## Troubleshooting (Quick)

| Issue | Cause | Fix |
|------|------|------|
| `Invalid API key` | Missing provider key | Check env vars |
| `Template not found` | Template/snapshot not deployed | Deploy with `make e2b/daytona` |
| Timeout | Long-running task | Increase `timeout` |

## Related Docs

- `docs/DEPLOY_CUSTOM_TEMPLATE.md`
- `docs/SANDBOX_REUSE.md`
- `docs/SDK_QUICK_START.md`
- `spec/SANDBOX_ADAPTERS.md`
