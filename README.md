# SandAgent

**Turn powerful coding agents into universal Super Agents.**

**SandAgent** is an open-source, sandboxed agent runtime that turns powerful **coding agents** into **general-purpose Super Agents**,
by running them inside isolated sandboxes with real filesystems and **streaming AI SDK–compatible UI messages end-to-end**.

SandAgent is designed for **product builders**, not demos:

* no protocol translation
* no event mapping
* no glue code

What the agent outputs is **exactly** what the UI renders.

---

## What is SandAgent?

Most agent systems split into two worlds:

* the *runtime world* (tools, sandboxes, execution)
* the *UI world* (messages, cards, streams)

SandAgent intentionally **collapses this boundary**.

> **The agent speaks the UI protocol directly.**

This allows SandAgent to act as:

* a sandboxed agent runtime
* a transport layer for AI SDK UI
* a persistent execution environment

All at the same time.

---

## Core Concept

### One SandAgent = One Sandbox + One Filesystem + One UI Stream

```text
SandAgent instance
  ├─ Isolated sandbox (E2B recommended / Sandock)
  ├─ Dedicated filesystem volume
  ├─ Claude Agent SDK (@anthropic-ai/claude-agent-sdk)
  ├─ Agent Template (system prompt, skills, MCP config)
  └─ AI SDK–compatible message stream
```

* Creating a `SandAgent` attaches to a sandbox
* The sandbox owns the filesystem
* Templates provide pre-configured agent behavior
* The CLI inside the sandbox **streams AI SDK UI messages**
* The server **passes them through unchanged**

---

## Why Passthrough?

SandAgent is optimized for **speed to product**.

By letting the CLI emit AI SDK UI messages directly:

* there is no protocol adapter layer
* there is no event re-encoding
* there is no impedance mismatch

```text
Claude Agent SDK
   ↓
SandAgent CLI
   ↓  (AI SDK UI messages)
Server (passthrough)
   ↓
AI SDK UI (render)
```

If it renders in AI SDK UI, SandAgent can stream it.

---

## Monorepo Structure

```text
sandagent/
├─ packages/
│  ├─ core/                # SandAgent lifecycle & sandbox binding
│  ├─ cli/                 # Agent runner CLI (AI SDK UI passthrough)
│  ├─ sdk/                 # Next.js / server passthrough helpers
│  ├─ sandbox-sandock/     # Sandock adapter
│  ├─ sandbox-e2b/         # E2B adapter (recommended)
│  ├─ runner-claude/       # Claude Agent SDK runtime
│  └─ benchmark/           # GAIA benchmark for comparing agent CLIs
├─ templates/
│  ├─ default/             # General-purpose agent template
│  ├─ coder/               # Software development focused
│  ├─ analyst/             # Data analysis optimized
│  └─ researcher/          # Web research capabilities
├─ examples/
│  └─ nextjs-app/
└─ README.md
```

---

## High-level API

### Creating a SandAgent

```ts
import { SandAgent } from "@sandagent/core";
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const agent = new SandAgent({
  id: "user-123-project-a",
  sandbox: new E2BSandbox(),  // Recommended default
  runner: {
    kind: "claude-agent-sdk",
    model: "claude-sonnet-4-20250514",
    template: "coder",  // Use the coder template
  },
});
```

* `id` identifies the sandbox and filesystem
* `template` loads pre-configured system prompt and settings
* Reusing the same `id` resumes the environment

---

### Streaming a task (passthrough)

```ts
return agent.stream({
  messages,
  workspace: {
    path: "/workspace",
  },
});
```

What happens:

1. SandAgent attaches to the sandbox
2. Executes the CLI runner inside the sandbox
3. CLI streams **AI SDK UI messages** to stdout
4. Server streams stdout directly to the client
5. AI SDK UI renders everything as-is

No translation.
No reinterpretation.

---

## Agent Templates

Templates provide pre-configured agent behavior including system prompts, skills, and MCP configurations.

### Available Templates

| Template | Description | Best For |
|----------|-------------|----------|
| `default` | General-purpose assistant | Starting point |
| `coder` | Software development focused | Coding, debugging, refactoring |
| `analyst` | Data analysis optimized | Data processing, SQL, visualization |
| `researcher` | Web research capabilities | Information gathering, summarization |

### Template Structure

```text
template-name/
├─ .claude/
│  ├─ settings.json      # Claude-specific settings
│  └─ mcp.json           # MCP server configuration
├─ CLAUDE.md             # System instructions for the agent
└─ skills/               # Pre-defined skill files
   ├── code-review.md
   └── debugging.md
```

### Using Templates

```ts
// Use the coder template
runner: {
  kind: "claude-agent-sdk",
  model: "claude-sonnet-4-20250514",
  template: "coder",
}
```

Or via CLI:

```bash
sandagent run --template coder -- "Build a REST API"
```

See [templates/README.md](./templates/README.md) for creating custom templates.

---

## Next.js + AI SDK Example

### `/app/api/ai/route.ts`

```ts
import { SandAgent } from "@sandagent/core";
import { E2BSandbox } from "@sandagent/sandbox-e2b";

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  const agent = new SandAgent({
    id: sessionId,
    sandbox: new E2BSandbox(),
    runner: {
      kind: "claude-agent-sdk",
      model: "claude-sonnet-4-20250514",
      template: "default",
    },
  });

  // Passthrough AI SDK UI stream
  return agent.stream({
    messages,
    workspace: { path: "/workspace" },
  });
}
```

The UI receives:

* assistant messages
* tool call cards
* logs and status updates

Exactly as produced by the agent runtime.

---

## CLI Contract

The CLI runs **inside the sandbox** and outputs **AI SDK UI messages**.

```bash
sandagent run \
  --model claude-sonnet-4-20250514 \
  --template coder \
  --cwd /workspace \
  -- "Create a weather script and run it"
```

### CLI Options

| Option | Description |
|--------|-------------|
| `-m, --model` | Model to use (default: claude-sonnet-4-20250514) |
| `-T, --template` | Template to use (default, coder, analyst, researcher) |
| `-c, --cwd` | Working directory (default: /workspace) |
| `-s, --system-prompt` | Custom system prompt (overrides template) |
| `-t, --max-turns` | Maximum conversation turns |
| `-a, --allowed-tools` | Comma-separated list of allowed tools |

### CLI guarantees

* stdout is a valid AI SDK UI message stream
* messages are ordered
* streaming is continuous until completion or error

SandAgent does not inspect or modify the stream.

---

## Persistence Model

### Filesystem

* Each agent has a dedicated filesystem volume
* Files persist across runs with the same `id`
* Agents can read, write, execute, and debug real artifacts

### Identity

```ts
new SandAgent({ id })
```

means:

> "Resume this world."

---

## Design Trade-offs (Explicit)

SandAgent intentionally chooses:

✅ **Simplicity over abstraction**
✅ **Passthrough over protocol generality**
✅ **UI-native streams over generic event logs**

This makes SandAgent:

* extremely easy to integrate
* ideal for AI SDK–based products

But also means:

* SandAgent is tightly coupled to AI SDK UI
* Non-UI consumers should build their own adapters

This is a conscious design decision.

---

## Roadmap

- [x] Agent Templates (default, coder, analyst, researcher)
- [x] GAIA Benchmark for comparing agent CLIs
- [x] JSONL transcript export (debugging / replay)
- [ ] Multiple UI stream profiles (web / terminal)
- [ ] Additional agent runtimes
- [ ] Snapshot & restore
- [ ] Volume export

---

## Non-goals

* ❌ Being UI-agnostic
* ❌ Acting as a generic agent event bus
* ❌ Supporting multiple UI protocols at once

SandAgent is opinionated by design.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Quick Start](./spec/QUICK_START.md) | Get running in 5 minutes |
| [Persistence Guide](./spec/PERSISTENCE_GUIDE.md) | Managing state across runs |
| [Sandbox Adapters](./spec/SANDBOX_ADAPTERS.md) | Configuring sandbox environments |
| [Debugging Guide](./spec/DEBUGGING_GUIDE.md) | Transcript recording and troubleshooting |
| [API Reference](./spec/API_REFERENCE.md) | Complete API documentation |
| [Technical Specification](./spec/TECHNICAL_SPEC.md) | Full architecture details |
| [Templates Guide](./templates/README.md) | Creating and using agent templates |

---

## One-line takeaway

> **SandAgent is a sandboxed Super Agent runtime that speaks AI SDK UI natively.**

---

## License

Apache 2.0