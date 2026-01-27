# SandAgent SDK Development Guide

Complete guide for integrating SandAgent SDK into your projects to create AI-powered applications.

## Table of Contents

- [Introduction](#introduction)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Getting Started](#getting-started)
- [Sandbox Integration](#sandbox-integration)
- [CLI Integration](#cli-integration)
- [Advanced Usage](#advanced-usage)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## Introduction

The SandAgent SDK allows developers to integrate powerful AI agent capabilities into their own projects. Unlike using SandAgent as a standalone application, the SDK gives you:

- **Full Control**: Customize every aspect of the agent behavior
- **Framework Agnostic**: Works with Next.js, Express, Fastify, Koa, or any Node.js framework
- **Production Ready**: Built-in support for cloud sandboxes and streaming responses
- **Type Safe**: Full TypeScript support with comprehensive type definitions

### What You Can Build

- AI-powered coding assistants
- Automated data analysis tools
- Research and information gathering systems
- Custom domain-specific AI agents
- Multi-agent workflows

---

## Installation

### Basic Installation

```bash
npm install @sandagent/sdk ai
```

### Framework-Specific Setup

#### Next.js (App Router)

```bash
npx create-next-app@latest my-ai-app
cd my-ai-app
npm install @sandagent/sdk ai
```

#### Next.js (Pages Router)

```bash
npx create-next-app@latest --use-npm my-ai-app
cd my-ai-app
npm install @sandagent/sdk ai
```

#### Express

```bash
mkdir my-ai-server && cd my-ai-server
npm init -y
npm install express @sandagent/sdk ai
```

#### Standalone CLI

```bash
mkdir my-ai-cli && cd my-ai-cli
npm init -y
npm install @sandagent/sdk ai
```

---

## Core Concepts

### 1. SandAgent Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Your Application (Next.js, Express, etc.)              │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│  @sandagent/sdk                                         │
│  ├─ createSandAgent() - Creates AI provider            │
│  ├─ useSandAgentChat() - React hook for UI             │
│  └─ SandAgentManager - Core orchestration              │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│  Sandbox Adapter (LocalSandbox, E2BSandbox, etc.)      │
│  - Isolated execution environment                       │
│  - File system access                                   │
│  - Process management                                   │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│  Runner (CLI that executes AI agent)                    │
│  - @sandagent/runner-cli                                │
│  - claude-code CLI                                      │
│  - Custom runner                                        │
└─────────────────────────────────────────────────────────┘
```

### 2. Key Components

#### `createSandAgent()`

Creates an AI SDK-compatible provider that wraps your sandbox and runner.

```typescript
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";
import path from "path";

const sandbox = new LocalSandbox({
  workdir: path.join(process.cwd(), "workspace"),
  templatesPath: process.cwd(),
});

const sandagent = createSandAgent({
  sandbox,
  cwd: sandbox.getWorkdir(),
});
```

#### Sandbox Adapters

Handle the isolated execution environment:

| Adapter | Use Case | Installation |
|---------|----------|--------------|
| `LocalSandbox` | Development, testing | Built-in |
| `E2BSandbox` | Production, cloud | `@sandagent/sandbox-e2b` |
| `SandockSandbox` | Docker-based | `@sandagent/sandbox-sandock` |
| `DaytonaSandbox` | Enterprise | `@sandagent/sandbox-daytona` |

#### Runners

Execute the actual AI agent logic:

- `@sandagent/runner-cli` - Default SandAgent runner
- Direct integration with Claude Code CLI
- Custom runner implementations

---

## Getting Started

### Quick Start: Next.js API Route

Create a basic AI chat endpoint in Next.js:

```typescript
// app/api/ai/route.ts
import path from "path";
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  // Setup environment variables
  const env: Record<string, string> = {};
  if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }

  // Create sandbox
  const sandbox = new LocalSandbox({
    workdir: path.join(process.cwd(), "workspace"),
    templatesPath: process.cwd(), // Copies .claude and CLAUDE.md from current directory
    runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
    defaultTimeout: 300000, // 5 minutes
    env,
  });

  // Create AI provider
  const sandagent = createSandAgent({
    sandbox,
    cwd: sandbox.getWorkdir?.(),
  });

  // Stream response
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: sandagent("claude-sonnet-4-20250514"),
        messages: await convertToModelMessages(messages),
        abortSignal: request.signal,
      });
      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

### Frontend Integration

```tsx
// app/page.tsx
"use client";

import { useSandAgentChat } from "@sandagent/sdk/react";
import { useState } from "react";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const { messages, isLoading, sendMessage } = useSandAgentChat({
    apiEndpoint: "/api/ai",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block p-3 rounded-lg ${
                msg.role === "user" ? "bg-blue-500 text-white" : "bg-gray-100"
              }`}
            >
              {msg.parts.map((part, i) =>
                part.type === "text" && <span key={i}>{part.text}</span>
              )}
            </div>
          </div>
        ))}
        {isLoading && <div className="text-gray-500">Thinking...</div>}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

---

## Sandbox Integration

### Local Sandbox (Development)

Perfect for local development and testing:

```typescript
import { LocalSandbox } from "@sandagent/sdk";
import path from "path";

const sandbox = new LocalSandbox({
  workdir: path.join(process.cwd(), "workspace"),
  templatesPath: process.cwd(), // Copies template files (.claude, CLAUDE.md) to workdir
  runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
  defaultTimeout: 300000, // 5 minutes (default: 60000)
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
});
```

**Options:**

- `workdir`: Working directory for all operations (defaults to `process.cwd()`)
- `templatesPath`: Path to the agent template directory to copy into the sandbox workdir. If specified, all files from this directory (including `.claude` and `CLAUDE.md`) will be copied to `workdir` when `attach()` is called
- `runnerCommand`: Command to execute the runner (default: `["sandagent", "run"]`)
- `defaultTimeout`: Default timeout for commands in milliseconds (default: 60000)
- `env`: Environment variables to pass to all commands

**Methods:**

- `getWorkdir()`: Get the working directory configured for this sandbox
- `getEnv()`: Get the environment variables configured for this sandbox
- `getRunnerCommand()`: Get the runner command to execute in the sandbox
- `attach()`: Attach to the sandbox (creates workdir and copies templates if needed)

### E2B Cloud Sandbox (Production)

Recommended for production deployments:

```bash
npm install @sandagent/sandbox-e2b
```

```typescript
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const sandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY,
  template: "base", // or custom template
  timeout: 600000, // 10 minutes
});
```

**Benefits:**

- ✅ Cloud-native isolation
- ✅ Auto-scaling
- ✅ No local Docker required
- ✅ Production-ready infrastructure

### Sandock Sandbox (Docker-based)

Self-hosted Docker sandbox:

```bash
npm install @sandagent/sandbox-sandock
```

```typescript
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const sandbox = new SandockSandbox({
  apiKey: process.env.SANDOCK_API_KEY,
  image: "sandagent/runtime:latest",
});
```

### Daytona Sandbox (Enterprise)

For enterprise workspaces:

```bash
npm install @sandagent/sandbox-daytona
```

```typescript
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";

const sandbox = new DaytonaSandbox({
  apiKey: process.env.DAYTONA_API_KEY,
  workspaceId: "my-workspace",
});
```

---

## CLI Integration

### Using Default Runner

The SDK can work with different CLI runners:

#### Option 1: SandAgent Runner CLI

```typescript
import path from "path";

const sandbox = new LocalSandbox({
  workdir: path.join(process.cwd(), "workspace"),
  templatesPath: process.cwd(),
  runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
  env: { ANTHROPIC_API_KEY },
});
```

#### Option 2: Claude Code CLI

```typescript
import path from "path";

const sandbox = new LocalSandbox({
  workdir: path.join(process.cwd(), "workspace"),
  templatesPath: process.cwd(),
  runnerCommand: ["claude"],
  env: { ANTHROPIC_API_KEY },
});
```

### Custom Runner Integration

Create your own runner for specialized behavior:

```typescript
// custom-runner.ts
import { Runner, RunnerOutput } from "@sandagent/manager";

export class CustomRunner implements Runner {
  async *run(input: string, options?: RunOptions): AsyncIterable<RunnerOutput> {
    // Your custom AI agent logic
    yield {
      type: "message",
      content: "Processing your request...",
    };

    // Execute custom logic
    const result = await this.processTask(input);

    yield {
      type: "message",
      content: result,
    };
  }

  private async processTask(input: string): Promise<string> {
    // Custom implementation
    return "Task completed";
  }
}
```

Usage:

```typescript
import { SandAgentManager } from "@sandagent/manager";
import { LocalSandbox } from "@sandagent/manager";
import { CustomRunner } from "./custom-runner";
import path from "path";

const manager = new SandAgentManager({
  runner: new CustomRunner(),
  sandbox: new LocalSandbox({
    workdir: path.join(process.cwd(), "workspace"),
    templatesPath: process.cwd(),
  }),
});
```

---

## Advanced Usage

### Custom Agent Templates

Define specialized agent behavior with `CLAUDE.md`:

```markdown
# Project Root: CLAUDE.md

# Data Analysis Agent

You are an expert data analyst specializing in:
- SQL query optimization
- Python data analysis (pandas, numpy)
- Data visualization (matplotlib, plotly)

## Workflow

1. Always understand the data structure first
2. Write clean, documented code
3. Validate results before presenting
4. Create clear visualizations
```

When `templatesPath` is specified, this file (along with the `.claude` directory) is automatically copied to the sandbox workdir when `attach()` is called.

### Agent Skills

Add modular capabilities with skills:

```
.claude/
└── skills/
    └── sql-expert/
        └── SKILL.md
```

```markdown
---
description: "SQL query optimization. Use when writing SQL queries."
---

# SQL Expert Skill

## Best Practices

- Always use indexes on WHERE clauses
- Prefer JOINs over subqueries
- Use EXPLAIN ANALYZE for query plans
```

### MCP Server Integration

Connect to external tools and services:

```json
// .claude/mcp.json
{
  "mcpServers": {
    "postgres": {
      "command": "mcp-server-postgres",
      "args": ["postgresql://localhost/mydb"]
    },
    "filesystem": {
      "command": "mcp-server-filesystem",
      "args": ["/workspace"]
    }
  }
}
```

### Session Management

Persist agent state across requests:

```typescript
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";
import path from "path";

// Create reusable sandbox for session
const sessionId = "user-123-project-a";
const sandbox = new LocalSandbox({
  workdir: `/tmp/sandagent-sessions/${sessionId}`,
  // Omit templatesPath to reuse existing workspace without copying templates
  runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
  env: { ANTHROPIC_API_KEY },
});

const sandagent = createSandAgent({ 
  sandbox,
  cwd: sandbox.getWorkdir(),
});
```

### Artifacts - Display AI Generated Content

SandAgent can automatically extract and display files, reports, charts, and other content generated by the AI agent. This is perfect for:

- 📊 Data analysis reports
- 📈 Visualizations and charts
- 📄 Generated documents
- 💻 Code files
- 🎨 HTML previews

**Basic Usage:**

```typescript
import { useSandAgentChat } from "@sandagent/sdk/react";

export default function ChatPage() {
  const {
    messages,
    sendMessage,
    artifacts,              // All generated artifacts
    selectedArtifact,       // Currently selected artifact
    setSelectedArtifact,    // Switch between artifacts
  } = useSandAgentChat({ apiEndpoint: "/api/ai" });

  return (
    <div className="flex h-screen">
      {/* Chat area */}
      <div className="flex-1">{/* ... */}</div>

      {/* Artifacts panel */}
      {artifacts.length > 0 && (
        <div className="w-96 border-l">
          <div className="flex gap-2 p-2 border-b">
            {artifacts.map((artifact) => (
              <button
                key={artifact.artifactId}
                onClick={() => setSelectedArtifact(artifact)}
              >
                {artifact.artifactId}
              </button>
            ))}
          </div>
          {selectedArtifact && (
            <div className="p-4">
              <pre>{selectedArtifact.content}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Enable artifacts in backend:**

```typescript
// app/api/ai/route.ts
const sandagent = createSandAgent({
  sandbox,
  cwd: sandbox.getWorkdir?.(),
  artifactProcessor: {
    enabled: true,
    sessionId: sessionId || "default",
  },
});
```

📖 **[Complete Artifacts Guide →](./SDK_ARTIFACTS_GUIDE.md)** - Learn about copy/download, Markdown rendering, HTML previews, and more advanced features.

### Error Handling

Handle errors gracefully:

```typescript
export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    const sandbox = new LocalSandbox({
      workdir: path.join(process.cwd(), "workspace"),
      templatesPath: process.cwd(),
      runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
      env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
    });

    const sandagent = createSandAgent({ sandbox });

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model: sandagent("claude-sonnet-4-20250514"),
          messages: await convertToModelMessages(messages),
          abortSignal: request.signal,
        });
        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("Agent error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
```

### Streaming Control

Control streaming behavior:

```typescript
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    const result = streamText({
      model: sandagent("claude-sonnet-4-20250514"),
      messages: await convertToModelMessages(messages),
      abortSignal: request.signal,
      onFinish: async (result) => {
        // Log completion
        console.log("Agent finished:", result);
      },
      experimental_throttle: 100, // Throttle stream updates
    });
    writer.merge(result.toUIMessageStream());
  },
});
```

---

## Production Deployment

### Environment Configuration

Set up production environment variables:

```bash
# .env.production
ANTHROPIC_API_KEY=sk-ant-xxx
E2B_API_KEY=your-e2b-key
NODE_ENV=production
```

### Production Sandbox Setup

Use cloud sandboxes for production:

```typescript
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const sandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY,
  template: "base",
  timeout: 600000,
  metadata: {
    userId: request.userId,
    environment: "production",
  },
});
```

### Vercel Deployment

Deploy to Vercel with proper configuration:

```json
// vercel.json
{
  "env": {
    "ANTHROPIC_API_KEY": "@anthropic-api-key",
    "E2B_API_KEY": "@e2b-api-key"
  },
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 300
    }
  }
}
```

### Docker Deployment

Create production Docker image:

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

```bash
docker build -t my-ai-app .
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -e E2B_API_KEY=$E2B_API_KEY \
  my-ai-app
```

### Rate Limiting

Implement rate limiting for production:

```typescript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests, please try again later.",
});

app.use("/api/ai", limiter);
```

### Monitoring

Add monitoring and logging:

```typescript
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";
import path from "path";

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Your agent logic
    const result = await processAgent(request);

    // Log success
    console.log({
      event: "agent_success",
      duration: Date.now() - startTime,
      userId: request.userId,
    });

    return result;
  } catch (error) {
    // Log error
    console.error({
      event: "agent_error",
      error: error.message,
      duration: Date.now() - startTime,
      userId: request.userId,
    });

    throw error;
  }
}
```

---

## Troubleshooting

### Common Issues

#### 1. Runner Command Not Found

**Problem**: `npx @sandagent/runner-cli not found`

**Solution**:
```typescript
// Use full path or install globally
runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"]
// or
runnerCommand: ["/usr/local/bin/sandagent", "run"]
```

#### 2. API Key Not Passed to Sandbox

**Problem**: Agent can't authenticate with Claude

**Solution**:
```typescript
import path from "path";

const env: Record<string, string> = {};
if (process.env.ANTHROPIC_API_KEY) {
  env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
}

const sandbox = new LocalSandbox({
  workdir: path.join(process.cwd(), "workspace"),
  templatesPath: process.cwd(),
  env, // Make sure to pass env
  runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
});
```

#### 3. Sandbox Isolation Issues

**Problem**: Agent can't find `CLAUDE.md` or `.claude` directory

**Solution**:
```typescript
import path from "path";

const sandbox = new LocalSandbox({
  workdir: path.join(process.cwd(), "workspace"), // Ensure correct working directory
  templatesPath: process.cwd(), // Copy .claude and CLAUDE.md from current directory
  runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
});
```

#### 4. Streaming Not Working

**Problem**: No real-time updates in UI

**Solution**:
```typescript
// Ensure proper AI SDK integration
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    const result = streamText({
      model: sandagent("claude-sonnet-4-20250514"),
      messages: await convertToModelMessages(messages),
    });
    writer.merge(result.toUIMessageStream()); // Important!
  },
});

return createUIMessageStreamResponse({ stream });
```

#### 5. Timeout Errors

**Problem**: Long-running tasks timeout

**Solution**:
```typescript
// Increase timeout in Vercel
// vercel.json
{
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 300 // 5 minutes
    }
  }
}

// Or use E2B with longer timeout
const sandbox = new E2BSandbox({
  timeout: 600000, // 10 minutes
});
```

### Debug Mode

Enable debug logging:

```typescript
import path from "path";

const sandbox = new LocalSandbox({
  workdir: path.join(process.cwd(), "workspace"),
  templatesPath: process.cwd(),
  runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
  env: {
    DEBUG: "sandagent:*", // Enable debug logs
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
});
```

### Getting Help

- 📚 [API Reference](../spec/API_REFERENCE.md)
- 🐛 [GitHub Issues](https://github.com/vikadata/sandagent/issues)
- 💬 [Discussions](https://github.com/vikadata/sandagent/discussions)
- 📧 Email: support@sandagent.dev

---

## Next Steps

- **[SDK Quick Start](./SDK_QUICK_START.md)** - 5-minute integration guide
- **[Artifacts Feature Guide](./SDK_ARTIFACTS_GUIDE.md)** - Display AI-generated content
- **[API Reference](../spec/API_REFERENCE.md)** - Complete API documentation
- **[Templates Guide](../templates/README.md)** - Creating custom agent templates
- **[Example Apps](../apps/)** - Production-ready examples

---

## Resources

### Official Documentation

- [AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Claude Code Documentation](https://code.claude.com/docs)
- [E2B Documentation](https://e2b.dev/docs)

### Example Projects

- [sandagent-example](../apps/sandagent-example/) - Complete Next.js application
- [sandagent-quickstart](../apps/sandagent-quickstart/) - Minimal starter

### Community

- GitHub: [vikadata/sandagent](https://github.com/vikadata/sandagent)
- Twitter: [@sandagent](https://twitter.com/sandagent)

---

<div align="center">
  <p>Built with 🏖️ by the SandAgent team</p>
  <p><strong>Turn powerful coding agents into Super Agents for any use case</strong></p>
</div>
