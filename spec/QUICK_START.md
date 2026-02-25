# Quick Start Guide

**Get your first Super Agent running in 5 minutes**

---

## What You'll Build

By the end of this guide, you'll have:
- A working AI agent that can execute code, analyze data, or research topics
- A web UI or CLI to interact with your agent
- Understanding of how to customize agents for your use case

---

## Prerequisites

- Node.js 20+
- pnpm 9+
- An Anthropic API key ([get one here](https://console.anthropic.com/))
- (Optional) E2B API key for cloud sandboxes ([get one here](https://e2b.dev/))

---

## Option 1: Try the Web UI (Easiest)

The fastest way to experience SandAgent:

```bash
# Clone and setup
git clone https://github.com/vikadata/sandagent.git
cd sandagent
pnpm install && pnpm build

# Start the documentation site
cd apps/web
pnpm dev
```

1. Open http://localhost:3000
2. Click **Settings** → Enter your Anthropic API key
3. Select a template (try "coder" or "analyst")
4. Start chatting!

**Example prompts to try:**
- "Create a Python script that analyzes CSV data"
- "Build a simple REST API with Express"
- "Research the latest trends in AI agents"

---

## Option 2: Use as a Library

### Install the packages

```bash
# Install core and sandbox adapter
pnpm add @sandagent/core @sandagent/sandbox-e2b
```

### Set up environment variables

Create a `.env.local` file:

```bash
# Required for agent execution
ANTHROPIC_API_KEY=sk-ant-...

# For E2B sandbox (if using)
E2B_API_KEY=e2b_...
```

---

## Basic Usage

### Creating an Agent

```ts
import { SandAgent } from "@sandagent/core";
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const agent = new SandAgent({
  id: "my-first-agent",
  sandbox: new E2BSandbox(),
  runner: {
    kind: "claude-agent-sdk",
    model: "claude-sonnet-4-20250514",
    template: "coder",  // Use a pre-built template
  },
});
```

### Streaming a Response

```ts
const response = await agent.stream({
  messages: [
    { role: "user", content: "Create a hello world script in Python" },
  ],
});

// The response is a standard Response object
// with an AI SDK UI compatible stream
```

### Uploading Files

```ts
await agent.uploadFiles([
  { path: "input.txt", content: "Hello, World!" },
  { path: "config.json", content: JSON.stringify({ debug: true }) },
]);
```

### Cleaning Up

```ts
// When done with the agent
await agent.destroy();
```

---

## Next.js Integration

### API Route Handler

Create `app/api/ai/route.ts`:

```ts
import { SandAgent } from "@sandagent/core";
import { SandockSandbox } from "@sandagent/sandbox-sandock";

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  const agent = new SandAgent({
    id: sessionId,
    sandbox: new SandockSandbox(),
    runner: {
      kind: "claude-agent-sdk",
      model: "claude-sonnet-4-20250514",
    },
  });

  // Returns AI SDK UI compatible stream
  return agent.stream({
    messages,
    workspace: { path: "/workspace" },
  });
}
```

### Client-side with AI SDK

```tsx
"use client";

import { useChat } from "ai/react";

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: "/api/ai",
    body: {
      sessionId: "user-session-123",
    },
  });

  return (
    <div>
      <div>
        {messages.map((m) => (
          <div key={m.id}>
            <strong>{m.role}:</strong> {m.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask the agent..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

---

## Sandbox Options

### Sandock (Docker-based)

Best for local development and self-hosted deployments:

```ts
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const sandbox = new SandockSandbox({
  image: "node:20-slim",
  volumePrefix: "/var/sandagent/volumes",
  networkEnabled: true,
});
```

**Requirements**: Docker installed and running.

### E2B (Cloud-based)

Best for production and scalability:

```ts
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const sandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY,
  template: "base",
  timeout: 60000,
});
```

**Requirements**: E2B API key from [e2b.dev](https://e2b.dev).

---

## Runner Options

### Claude Agent SDK (Default)

```ts
const agent = new SandAgent({
  id: "my-agent",
  sandbox: new SandockSandbox(),
  runner: {
    kind: "claude-agent-sdk",
    model: "claude-sonnet-4-20250514",
    systemPrompt: "You are a helpful coding assistant.",
    maxTurns: 10,
    allowedTools: ["bash", "write_file", "read_file"],
  },
});
```

---

## Common Patterns

### Session Management

```ts
function getAgentForSession(sessionId: string) {
  return new SandAgent({
    id: sessionId,
    sandbox: new SandockSandbox(),
    runner: {
      kind: "claude-agent-sdk",
      model: "claude-sonnet-4-20250514",
    },
  });
}
```

### Error Handling

```ts
try {
  const response = await agent.stream({ messages });
  return response;
} catch (error) {
  console.error("Agent error:", error);
  return new Response("Agent execution failed", { status: 500 });
}
```

### File Upload Before Execution

```ts
// Upload project files
await agent.uploadFiles([
  { path: "package.json", content: packageJsonContent },
  { path: "src/index.ts", content: sourceCode },
]);

// Then ask agent to work with them
return agent.stream({
  messages: [
    { role: "user", content: "Review the code and fix any issues" },
  ],
});
```

---

## Next Steps

- [Persistence Guide](./PERSISTENCE_GUIDE.md) - Managing state across runs
- [Technical Specification](./TECHNICAL_SPEC.md) - Full architecture details
- [Sandbox Adapters Guide](./SANDBOX_ADAPTERS.md) - Configuring sandboxes
- [API Reference](./API_REFERENCE.md) - Complete API documentation

---

## Troubleshooting

### Docker not running

```
Error: Cannot connect to Docker daemon
```

**Solution**: Start Docker Desktop or the Docker daemon.

### API key not set

```
Error: ANTHROPIC_API_KEY not found
```

**Solution**: Set the environment variable in your `.env.local` file.

### Sandbox timeout

```
Error: Sandbox execution timed out
```

**Solution**: Increase the timeout in sandbox options or optimize the task.

---

## Getting Help

- [GitHub Issues](https://github.com/vikadata/sandagent/issues)
- [Technical Specification](./TECHNICAL_SPEC.md)
