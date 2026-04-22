<div align="center">
  <h1>@bunny-agent/sdk</h1>
  <p><strong>Plug Coding Agent superpowers into your product — in one afternoon.</strong></p>
  <p>
    Turn <a href="https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview">Claude Code</a>,
    <a href="https://docs.anthropic.com/en/docs/agents-and-tools/agent-sdk">Anthropic Agent SDK</a>,
    <a href="https://github.com/openai/codex">Codex CLI</a>,
    <a href="https://github.com/nicepkg/opencode">OpenCode</a>,
    and other Coding Agents into an <strong>AI SDK-compatible model</strong> you can stream from any backend and render in any React UI.
  </p>

  [![npm](https://img.shields.io/npm/v/@bunny-agent/sdk?style=flat-square)](https://www.npmjs.com/package/@bunny-agent/sdk)
  [![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
  [![AI SDK](https://img.shields.io/badge/AI_SDK-v6-purple.svg?style=flat-square)](https://sdk.vercel.ai/)
</div>

---

## Why @bunny-agent/sdk?

Coding Agents (Claude Code, Codex CLI, Gemini CLI, OpenCode …) already have:

- ✅ Sophisticated memory & context management
- ✅ Battle-tested tool use (bash, file I/O, web search)
- ✅ MCP server ecosystem
- ✅ Refined prompts from millions of interactions

**@bunny-agent/sdk lets you harness all of that inside your own product** — as a standard AI SDK model, with zero prompt engineering.

```
Your App  →  @bunny-agent/sdk  →  Coding Agent (Claude / Codex / …)
                                      ↕
                              Sandbox (Local or Cloud)
```

## Features

| Feature | Description |
|---------|-------------|
| 🔌 **AI SDK Provider** | `createBunnyAgent()` returns a model you pass to `streamText` / `generateText` |
| ⚛️ **React Hooks** | `useBunnyAgentChat`, `useArtifacts`, `useWriteTool`, `useAskUserQuestion` |
| 🖥️ **Local Mode** | Built-in `LocalSandbox` — run on your machine for Desktop apps & debugging |
| ☁️ **Cloud Sandboxes** | Plug in [Sandock](https://sandock.ai), E2B, or Daytona for isolated cloud execution |
| 🎨 **Agent Templates** | Markdown-based templates turn a generic agent into a domain expert |
| 🔄 **Multi-turn Sessions** | Resume conversations with full filesystem continuity |

---

## Quick Start

### 1. Install

```bash
npm install @bunny-agent/sdk ai
```

### 2. Backend — Create an API Route (Next.js)

```typescript
// app/api/ai/route.ts
import { createBunnyAgent, LocalSandbox } from "@bunny-agent/sdk";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const sandbox = new LocalSandbox({
    workdir: process.cwd(),
    templatesPath: process.cwd(),
    runnerCommand: ["npx", "-y", "@bunny-agent/runner-cli@latest", "run"],
    env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
  });

  const bunnyAgent = createBunnyAgent({
    sandbox,
    cwd: sandbox.getWorkdir(),
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: bunnyAgent("sonnet"),
        messages: await convertToModelMessages(messages),
        abortSignal: request.signal,
      });
      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

### 3. Frontend — Chat UI

```tsx
"use client";
import { useBunnyAgentChat } from "@bunny-agent/sdk/react";

export default function Chat() {
  const { messages, isLoading, sendMessage } = useBunnyAgentChat({
    apiEndpoint: "/api/ai",
  });

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.parts.map((p, i) => p.type === "text" && <span key={i}>{p.text}</span>)}
        </div>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); sendMessage(e.currentTarget.input.value); }}>
        <input name="input" placeholder="Ask anything…" />
        <button disabled={isLoading}>Send</button>
      </form>
    </div>
  );
}
```

### 4. Run

```bash
export ANTHROPIC_API_KEY=sk-ant-xxx
npm run dev
```

That's it — you now have a full Coding Agent streaming into your app.

---

## Local vs Cloud Sandbox

### Local Mode (Desktop apps & debugging)

`LocalSandbox` is built-in — no extra packages needed. The agent runs directly on your machine's filesystem.

```typescript
import { createBunnyAgent, LocalSandbox } from "@bunny-agent/sdk";

const sandbox = new LocalSandbox({
  workdir: "/path/to/project",
  templatesPath: "./my-agent-template",
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
});

const bunnyAgent = createBunnyAgent({ sandbox, cwd: sandbox.getWorkdir() });
```

Best for: Electron/Tauri desktop apps, local development, debugging.

### Cloud Mode — Sandock (Recommended)

[Sandock](https://sandock.ai) provides Docker-based cloud sandboxes with persistent volumes.

> **Why Sandock?** Coding Agents rely on filesystem `append` and other POSIX semantics. Sandock is the only cloud sandbox with **100% POSIX-compatible filesystems**, ensuring agents run without FS failures. Volumes are **persistent and shareable** across sandboxes.

```bash
npm install @bunny-agent/sandbox-sandock
```

```typescript
import { createBunnyAgent } from "@bunny-agent/sdk";
import { SandockSandbox } from "@bunny-agent/sandbox-sandock";

const sandbox = new SandockSandbox({
  apiKey: process.env.SANDOCK_API_KEY,   // Get yours at https://sandock.ai
  image: "ghcr.io/vikadata/bunny-agent:latest",     // Pre-built image (fast startup)
  skipBootstrap: true,
  workdir: "/workspace",
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
  // Optional: persistent volumes
  volumes: [
    { volumeName: "my-workspace", volumeMountPath: "/workspace" },
  ],
});

const bunnyAgent = createBunnyAgent({ sandbox, cwd: sandbox.getWorkdir() });
```

| Sandock Option | Description |
|----------------|-------------|
| `apiKey` | Your Sandock API key ([sandock.ai](https://sandock.ai)) |
| `image` | Docker image — use `ghcr.io/vikadata/bunny-agent:latest` for pre-built, or `sandockai/sandock-code:latest` |
| `skipBootstrap` | `true` when using pre-built image (skips npm install inside sandbox) |
| `volumes` | Named volumes for persistent workspace & session storage |
| `keep` | `true` (default) keeps sandbox alive ~30 min after execution |
| `memoryLimitMb` | Memory limit in MB |

### Other Cloud Sandboxes

```bash
npm install @bunny-agent/sandbox-e2b      # E2B cloud sandbox
npm install @bunny-agent/sandbox-daytona   # Daytona workspace
```

```typescript
import { E2BSandbox } from "@bunny-agent/sandbox-e2b";
const sandbox = new E2BSandbox({ apiKey: process.env.E2B_API_KEY });

import { DaytonaSandbox } from "@bunny-agent/sandbox-daytona";
const sandbox = new DaytonaSandbox({ apiKey: process.env.DAYTONA_API_KEY });
```

---

## Agent Templates

Templates customize what the agent knows and how it behaves — pure Markdown, no code.

```
my-agent/
├── CLAUDE.md              # System instructions
├── skills/
│   └── sql-expert/
│       └── SKILL.md       # Modular capability
└── .claude/
    └── mcp.json           # MCP server integrations
```

```typescript
const sandbox = new LocalSandbox({
  workdir: process.cwd(),
  templatesPath: "./templates/analyst",  // Point to your template
});
```

Built-in templates: `default`, `coder`, `analyst`, `researcher`, `seo-agent`.

---

## React Hooks

All hooks are available from `@bunny-agent/sdk/react`:

```typescript
import {
  useBunnyAgentChat,     // Full chat with streaming
  useArtifacts,         // Display agent-generated files (reports, charts)
  useWriteTool,         // Handle file write tool calls
  useAskUserQuestion,   // Handle interactive questions from the agent
} from "@bunny-agent/sdk/react";
```

---

## API Reference

### Provider

#### `createBunnyAgent` — sandbox transport (cloud / local filesystem)

```typescript
import { createBunnyAgent, LocalSandbox } from "@bunny-agent/sdk";

const bunnyAgent = createBunnyAgent({
  sandbox: SandboxAdapter,       // LocalSandbox, SandockSandbox, E2BSandbox, etc.
  cwd?: string,                  // Working directory inside sandbox
  env?: Record<string, string>,  // Environment variables
  template?: string,             // Template name
  resume?: string,               // Session ID for multi-turn
  verbose?: boolean,             // Debug logging
});

const model = bunnyAgent("claude-sonnet-4-20250514");
```

When using `streamText({ model, tools })`, the SDK forwards the provided tool
names as the runner's per-request allowed tool list.

#### Daemon HTTP transport (same provider)

**With any sandbox adapter** (E2B, Sandock, `LocalSandbox`, etc.): pass **`sandbox` + `daemonUrl`**. The URL is resolved **inside** the sandbox (the `vikadata/bunny-agent` image starts `bunny-agent-daemon` on port 3080). The SDK streams via `streamCodingRunFromSandbox` (`curl -N` in the sandbox, including `LocalSandbox`), not `fetch` from your server. It does **not** call `/healthz` for you — use `isBunnyAgentDaemonHealthy` from `@bunny-agent/sdk` when you want a probe before setting `daemonUrl` (e.g. to fall back to the CLI runner).

```typescript
import { createBunnyAgent, DEFAULT_BUNNY_AGENT_DAEMON_URL } from "@bunny-agent/sdk";

const bunnyAgent = createBunnyAgent({
  sandbox: mySandboxAdapter,
  daemonUrl: DEFAULT_BUNNY_AGENT_DAEMON_URL, // http://127.0.0.1:3080 inside the container
  runnerType: "claude",
  cwd: "/workspace",
});
```

Omit `daemonUrl` to use the **CLI runner** in the same sandbox. `createBunnyAgent` always requires a `sandbox` adapter.

### Exports

| Entry Point | Exports |
|-------------|---------|
| `@bunny-agent/sdk` | `createBunnyAgent`, `LocalSandbox`, `BunnyAgentLanguageModel`, `submitAnswer`, `DEFAULT_BUNNY_AGENT_DAEMON_URL` (re-exported from `@bunny-agent/manager`) |
| `@bunny-agent/sdk/react` | `useBunnyAgentChat`, `useArtifacts`, `useWriteTool`, `useAskUserQuestion`, `DEFAULT_BUNNY_AGENT_DAEMON_URL` (re-exported from `@bunny-agent/manager`) |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `SANDOCK_API_KEY` | For Sandock | [sandock.ai](https://sandock.ai) API key |
| `E2B_API_KEY` | For E2B | E2B API key |
| `DAYTONA_API_KEY` | For Daytona | Daytona API key |

---

## Documentation

📖 Full docs: [bunny-agent.dev/docs](https://bunny-agent.dev/docs)

- [Quick Start Guide](https://bunny-agent.dev/docs/quick-start)
- [Sandbox Configuration](https://bunny-agent.dev/docs/sandboxes)
- [Agent Templates](https://bunny-agent.dev/docs/templates)
- [API Reference](https://bunny-agent.dev/docs/api)

---

## License

Apache-2.0
