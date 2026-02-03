# SandAgent SDK Development Guide

This guide explains how to integrate SandAgent SDK into your app and how the main pieces fit together. For a minimal setup, see `docs/SDK_QUICK_START.md`.

## Installation

```bash
npm install @sandagent/sdk ai
```

Optional sandbox providers:

```bash
npm install @sandagent/sandbox-e2b
npm install @sandagent/sandbox-daytona
npm install @sandagent/sandbox-sandock
```

## Core Concepts

### Provider + Sandbox + Runner

- **Provider**: `createSandAgent()` returns an AI SDK-compatible model
- **Sandbox**: isolates code execution
- **Runner**: executes the agent inside the sandbox

### Minimal Provider Setup

```typescript
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";

const sandbox = new LocalSandbox({
  workdir: process.cwd(),
  templatesPath: process.cwd(),
});

const sandagent = createSandAgent({
  sandbox,
  cwd: sandbox.getWorkdir(),
});
```

## Basic Integration (Next.js)

```typescript
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, streamText } from "ai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const sandbox = new LocalSandbox({
    workdir: process.cwd(),
    templatesPath: process.cwd(),
    runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
    env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const sandagent = createSandAgent({ sandbox, cwd: sandbox.getWorkdir() });
      const result = streamText({
        model: sandagent("sonnet"),
        messages: await convertToModelMessages(messages),
        abortSignal: request.signal,
      });
      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

## Sandbox Options

| Adapter | Use Case | Package |
|------|------|------|
| `LocalSandbox` | Local dev/test | Built in |
| `E2BSandbox` | Cloud production | `@sandagent/sandbox-e2b` |
| `DaytonaSandbox` | Persistent volumes | `@sandagent/sandbox-daytona` |
| `SandockSandbox` | Docker-based | `@sandagent/sandbox-sandock` |

See:

- `docs/SERVER_SANDBOX_GUIDE.md`
- `docs/SANDBOX_REUSE.md`

## Templates and Skills

- Templates live under `templates/`
- `CLAUDE.md` defines system instructions
- `.claude/skills/` defines skills

See:

- `templates/README.md`
- `docs/DEPLOY_CUSTOM_TEMPLATE.md`

## Output Formats

`runner-cli` supports SSE and JSON output. See `docs/OUTPUT_FORMAT.md`.

## Artifacts

Artifacts let the agent stream files into the UI. See:

- `docs/SDK_ARTIFACTS_GUIDE.md`
- `docs/ARTIFACT_FEATURE.md`

## AskUserQuestion

- `docs/ASK_USER_QUESTION_APPROVAL_GUIDE.md`

## Production Notes

- Use a server sandbox provider (E2B/Daytona/Sandock)
- Ensure provider API keys are set
- Increase `timeout` for long-running tasks

## Troubleshooting (Quick)

- **Missing API key**: verify env vars
- **Template not found**: deploy or use `templatesPath`
- **No streaming**: check AI SDK integration and `createUIMessageStream`

## Related Docs

- `docs/SDK_QUICK_START.md`
- `docs/OUTPUT_FORMAT.md`
- `spec/API_REFERENCE.md`
