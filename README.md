# SandAgent

**Turn powerful coding agents into universal Super Agents.**

---

## 🚀 Quick Start

Choose your preferred way to get started. All options are designed for **developers to debug and test** SandAgent capabilities.

### Understanding the Apps

| App | What it is | Best for |
|-----|------------|----------|
| **sandagent-example** | Complete Next.js web app with AI chat UI | First-time users, web integration testing |
| **manager-cli** | Command-line tool to manage sandboxes | DevOps, server-side orchestration |
| **runner-cli** | Terminal-based agent (like claude-code, gemini-cli) | Local development, CLI enthusiasts |

### Option A: Web UI (Recommended for first-time users)

**sandagent-example** is a complete Next.js application with:
- 💬 Full AI chat interface with real-time streaming
- 🎨 Template selector (default, coder, analyst, researcher)
- ⚙️ In-browser settings page to configure API keys
- 🚀 Deployable to Vercel with one click

```bash
# Clone and setup
git clone https://github.com/vikadata/sandagent.git
cd sandagent
pnpm install && pnpm build

# Start the example app
cd apps/sandagent-example
pnpm dev
```

Open http://localhost:3000 → Click **Settings** → Enter your API keys → Start chatting!

> **Note:** API keys are configured in the browser settings page, not environment variables. This makes it easy to test without server configuration.

### Option B: Manager CLI

**manager-cli** provides the `sandagent` command for managing sandboxes and running agents from the command line:

```bash
# After building (see Option A)
cd apps/manager-cli && pnpm build

# Set environment variables
export ANTHROPIC_API_KEY=your_key
export E2B_API_KEY=your_e2b_key

# Run an agent task
npx sandagent run "Create a hello world script"

# Run with a specific template
npx sandagent run --template coder "Build a REST API"

# List available templates
npx sandagent templates

# See all commands
npx sandagent --help
```

**Use cases:** Server-side automation, CI/CD pipelines, managing multiple sandbox instances.

### Option C: Runner CLI (Local Development)

**runner-cli** provides `sandagent-runner` - a terminal-based agent similar to `gemini-cli` or `claude-code`:

```bash
# After building (see Option A)
cd apps/runner-cli && pnpm build

# Set environment variables
export ANTHROPIC_API_KEY=your_key

# Run from a template directory
cd templates/coder
npx sandagent-runner run -- "Build a REST API with Express"

# Or specify a template
npx sandagent-runner run --template analyst -- "Analyze this data"
```

**Use cases:** Local development, terminal-based workflows, developers who prefer CLI over web UI.

### Option D: Run Tests

Verify everything works without needing API keys:

```bash
git clone https://github.com/vikadata/sandagent.git
cd sandagent
pnpm install && pnpm build
pnpm test  # 87 tests
```

---

## What is SandAgent?

**SandAgent** is an open-source, sandboxed agent runtime that turns powerful **coding agents** into **general-purpose Super Agents**,
by running them inside isolated sandboxes with real filesystems and **streaming AI SDK–compatible UI messages end-to-end**.

SandAgent is designed for **product builders**, not demos:

* no protocol translation
* no event mapping
* no glue code

What the agent outputs is **exactly** what the UI renders.

---

## Core Concept

Most agent systems split into two worlds:

* the *runtime world* (tools, sandboxes, execution)
* the *UI world* (messages, cards, streams)

SandAgent intentionally **collapses this boundary**.

> **The agent speaks the UI protocol directly.**

### One SandAgent = One Sandbox + One Filesystem + One UI Stream

```text
SandAgent instance
  ├─ Isolated sandbox (E2B recommended / Sandock)
  ├─ Dedicated filesystem volume
  ├─ Claude Agent SDK (@anthropic-ai/claude-agent-sdk)
  ├─ Agent Template (system prompt, skills, MCP config)
  └─ AI SDK–compatible message stream
```

---

## Monorepo Structure

```text
sandagent/
├─ apps/
│  ├─ sandagent-example/   # Complete Next.js app with AI chat UI
│  ├─ manager-cli/         # sandagent command - manage sandboxes, run agents
│  └─ runner-cli/          # sandagent-runner - like gemini-cli, runs locally
├─ packages/
│  ├─ core/                # SandAgent lifecycle & sandbox binding
│  ├─ sdk/                 # Next.js / server passthrough helpers
│  ├─ sandbox-sandock/     # Docker sandbox adapter
│  ├─ sandbox-e2b/         # E2B cloud sandbox adapter (recommended)
│  ├─ runner-claude/       # Claude Agent SDK runtime
│  └─ benchmark/           # GAIA benchmark for comparing agent CLIs
├─ templates/
│  ├─ default/             # General-purpose agent template
│  ├─ coder/               # Software development focused
│  ├─ analyst/             # Data analysis optimized
│  └─ researcher/          # Web research capabilities
└─ spec/                   # Documentation and specifications
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

No translation. No reinterpretation.

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

### Using Templates

```ts
// Use the coder template in code
runner: {
  kind: "claude-agent-sdk",
  model: "claude-sonnet-4-20250514",
  template: "coder",
}
```

```bash
# Use the coder template via CLI
sandagent run --template coder "Build a REST API"
```

See [templates/README.md](./templates/README.md) for creating custom templates.

---

## Development

### Prerequisites

* Node.js >= 20.0.0
* pnpm 9.0.0+

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm install` | Install all dependencies across workspaces |
| `pnpm build` | Build all packages and apps |
| `pnpm test` | Run all tests (87 tests) |
| `pnpm lint` | Run linters on all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm clean` | Clean build artifacts |

### Working with Individual Packages

```bash
# Build a specific package
cd packages/core
pnpm build

# Run tests for a specific package
cd packages/core
pnpm test

# Run tests in watch mode
pnpm test -- --watch
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | API key for Claude Agent SDK |
| `E2B_API_KEY` | For E2B | API key for E2B cloud sandbox |
| `SANDOCK_API_KEY` | For Sandock | API key for Sandock cloud sandbox (get at [sandock.ai](https://sandock.ai)) |

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

## Roadmap

- [x] Agent Templates (default, coder, analyst, researcher)
- [x] GAIA Benchmark for comparing agent CLIs
- [x] JSONL transcript export (debugging / replay)
- [x] Manager CLI (sandagent command)
- [x] Runner CLI (sandagent-runner command)
- [ ] Multiple UI stream profiles (web / terminal)
- [ ] Additional agent runtimes
- [ ] Snapshot & restore
- [ ] Volume export

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

## One-line takeaway

> **SandAgent is a sandboxed Super Agent runtime that speaks AI SDK UI natively.**

---

## License

Apache 2.0