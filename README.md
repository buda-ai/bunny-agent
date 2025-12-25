<div align="center">
  <img src="spec/logo.svg" alt="SandAgent Logo" width="200" height="200">
  
  # SandAgent
  
  ### 🏖️ Turn powerful coding agents into universal Super Agents
  
  **Sandboxed agent runtime with AI SDK UI passthrough streaming**  
  Run Claude Agent SDK in isolated sandboxes with real filesystems
  
  [![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg?style=flat-square)](https://www.typescriptlang.org/)
  [![AI SDK](https://img.shields.io/badge/AI_SDK-v6-purple.svg?style=flat-square)](https://sdk.vercel.ai/)
  [![pnpm](https://img.shields.io/badge/pnpm-9.0+-orange.svg?style=flat-square)](https://pnpm.io/)
  
  [Quick Start](#-quick-start) · [Features](#-features) · [Architecture](#-architecture) · [Documentation](#-documentation)
  
</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🏖️ Sandboxed Execution
Isolated E2B or Sandock containers with real filesystems

### 🔄 Zero Translation
AI SDK UI messages stream directly from agent to UI

### 🤖 Claude Agent SDK
Official `@anthropic-ai/claude-agent-sdk` integration

### 📦 Agent Templates
Pre-configured coder, analyst, researcher templates

### 💾 Persistent State
Resume agent sessions with filesystem continuity

</td>
<td width="50%">

### 🚀 Passthrough Streaming
Server never parses or mutates the stream

### 🎯 GAIA Benchmark
Compare agents: sandagent, gemini-cli, claudecode, codex-cli

### 📝 Transcript Export
JSONL recording for debugging and replay

### ⚙️ Swappable Sandboxes
E2B cloud or Sandock (Docker) with one line

### 🌐 Web + CLI
Complete Next.js app and terminal-based runners

</td>
</tr>
</table>

---

## 🎯 Why SandAgent?

### 🌟 The Problem

Most agent systems have two disconnected worlds:

| Runtime World | UI World |
|---------------|----------|
| Tools, sandboxes, execution | Messages, cards, streams |
| Custom event formats | AI SDK UI protocol |
| Translation layers | Impedance mismatch |

### ✅ SandAgent's Solution

**The agent speaks the UI protocol directly.**

<table>
<tr>
<td>

### ❌ Traditional Approach
- Agent outputs custom events
- Server translates to UI format
- Protocol adapters everywhere
- Debugging across layers

</td>
<td>

### ✅ With SandAgent
- Agent outputs **AI SDK UI messages**
- Server does **pure passthrough**
- **Zero protocol translation**
- Debug **end-to-end**

</td>
</tr>
</table>

**Result:** What the agent outputs is **exactly** what the UI renders.

---

## 🚀 Quick Start

### Understanding the Apps

| App | What it is | Best for |
|-----|------------|----------|
| **sandagent-example** | Complete Next.js web app with AI chat UI | First-time users, web integration |
| **manager-cli** | Command-line sandbox management | DevOps, server-side orchestration |
| **runner-cli** | Terminal-based agent (like gemini-cli) | Local development, CLI enthusiasts |

### Option A: Web UI (Recommended)

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
```

### Option C: Runner CLI

```bash
# After building (see Option A)
cd apps/runner-cli && pnpm build

# Set environment variables
export ANTHROPIC_API_KEY=your_key

# Run from a template directory
cd templates/coder
npx sandagent-runner run -- "Build a REST API with Express"
```

### Option D: Run Tests

Verify everything works without needing API keys:

```bash
pnpm install && pnpm build
pnpm test  # 93 tests
```

---

## 🏗️ Architecture

```
┌────────────┐
│   Web UI   │
│ (AI SDK)   │
└─────▲──────┘
      │  AI SDK stream (unchanged)
      │
┌─────┴──────┐
│  Server    │
│ (Next.js)  │
│ passthrough│
└─────▲──────┘
      │ stdout (stream)
      │
┌─────┴──────┐
│  Sandbox   │
│ (E2B/Sandock)│
└─────▲──────┘
      │ exec
      │
┌─────┴──────┐
│   CLI      │
│ sandagent  │
└─────▲──────┘
      │
┌─────┴──────┐
│ Claude     │
│ Agent SDK  │
└────────────┘
```

**Invariant:** Whatever the CLI writes to `stdout` **must be a valid AI SDK UI stream**.

---

## 📦 Monorepo Structure

```
sandagent/
├─ apps/
│  ├─ sandagent-example/   # Complete Next.js app with AI chat UI
│  ├─ manager-cli/         # sandagent command - manage sandboxes
│  └─ runner-cli/          # sandagent-runner - like gemini-cli
├─ packages/
│  ├─ core/                # SandAgent lifecycle & sandbox binding
│  ├─ sdk/                 # Next.js / server passthrough helpers
│  ├─ sandbox-sandock/     # Sandock cloud sandbox adapter
│  ├─ sandbox-e2b/         # E2B cloud sandbox adapter
│  ├─ runner-claude/       # Claude Agent SDK runtime
│  └─ benchmark/           # GAIA benchmark for comparing agents
├─ templates/
│  ├─ default/             # General-purpose agent template
│  ├─ coder/               # Software development focused
│  ├─ analyst/             # Data analysis optimized
│  └─ researcher/          # Web research capabilities
└─ spec/                   # Documentation and specifications
```

---

## 🔧 Core API

### Creating a SandAgent

```typescript
import { SandAgent } from "@sandagent/core";
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const agent = new SandAgent({
  id: "user-123-project-a",
  sandbox: new E2BSandbox(),  // Recommended default
  runner: {
    kind: "claude-agent-sdk",
    model: "claude-sonnet-4-20250514",
    template: "coder",
  },
});
```

### Streaming a Task

```typescript
return agent.stream({
  messages,
  workspace: { path: "/workspace" },
});
```

What happens:

1. SandAgent attaches to the sandbox
2. Executes the CLI runner inside the sandbox
3. CLI streams **AI SDK UI messages** to stdout
4. Server streams stdout directly to the client
5. AI SDK UI renders everything as-is

**No translation. No reinterpretation.**

---

## 🎨 Agent Templates

| Template | Description | Skills |
|----------|-------------|--------|
| `default` | General-purpose assistant | - |
| `coder` | Software development | Code review, Debugging |
| `analyst` | Data analysis | Data cleaning |
| `researcher` | Web research | Source evaluation |

Each template includes:
- `.claude/settings.json` - Model configuration
- `.claude/mcp.json` - MCP server configuration
- `CLAUDE.md` - System instructions
- `skills/` - Pre-defined skill files

```typescript
runner: {
  kind: "claude-agent-sdk",
  model: "claude-sonnet-4-20250514",
  template: "coder",  // Use the coder template
}
```

📖 **[Templates Guide →](./templates/README.md)**

---

## 🔄 Swappable Sandboxes

Switch sandbox providers with one line:

```typescript
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { SandockSandbox } from "@sandagent/sandbox-sandock";

// Use E2B (recommended for production)
sandbox: new E2BSandbox()

// Use Sandock (Docker-based)
sandbox: new SandockSandbox({
  apiKey: process.env.SANDOCK_API_KEY,
})
```

| Provider | Best for | Setup |
|----------|----------|-------|
| **E2B** | Production, cloud | `E2B_API_KEY` env var |
| **Sandock** | Development, self-hosted | `SANDOCK_API_KEY` env var |

📖 **[Sandbox Adapters Guide →](./spec/SANDBOX_ADAPTERS.md)**

---

## 🎯 GAIA Benchmark

Compare agent performance across CLIs:

```bash
# Download GAIA dataset
sandagent-benchmark download

# Run benchmarks
sandagent-benchmark run --runner sandagent --level 1
sandagent-benchmark run --runner claudecode --level 1
sandagent-benchmark run --runner gemini-cli --level 1

# Compare results
sandagent-benchmark compare
```

Supported runners: `sandagent`, `gemini-cli`, `claudecode`, `codex-cli`

📖 **[Benchmark Guide →](./packages/benchmark/README.md)**

---

## 🛠️ Development

### Prerequisites

- Node.js >= 20.0.0
- pnpm 9.0.0+

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests (93 tests) |
| `pnpm lint` | Run linters |
| `pnpm typecheck` | Type-check all packages |
| `pnpm clean` | Clean build artifacts |
| `pnpm changeset` | Create a changeset for version bumps |
| `pnpm version` | Update versions based on changesets |
| `pnpm release` | Build and publish to npm |

### Releasing Packages

This project uses [Changesets](https://github.com/changesets/changesets) for version management and npm publishing.

```bash
# 1. Create a changeset when you make changes
pnpm changeset

# 2. Follow prompts to select packages and bump type (major/minor/patch)

# 3. Commit the changeset file and push to your PR
```

When PRs are merged to `main` or `develop`:
1. GitHub Action creates a "Version Packages" PR
2. Merging that PR publishes packages to npm

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | API key for Claude Agent SDK |
| `E2B_API_KEY` | For E2B | API key for E2B cloud sandbox |
| `SANDOCK_API_KEY` | For Sandock | API key for Sandock cloud sandbox |

---

## 📚 Documentation

<table>
<tr>
<td width="50%">

### 📖 Guides
- **[Quick Start](./spec/QUICK_START.md)** - Get running in 5 minutes
- **[Persistence Guide](./spec/PERSISTENCE_GUIDE.md)** - Managing state across runs
- **[Sandbox Adapters](./spec/SANDBOX_ADAPTERS.md)** - E2B & Sandock configuration
- **[Debugging Guide](./spec/DEBUGGING_GUIDE.md)** - Transcript recording
- **[Templates Guide](./templates/README.md)** - Creating custom templates

</td>
<td width="50%">

### 🔧 Reference
- **[API Reference](./spec/API_REFERENCE.md)** - Complete API documentation
- **[Technical Spec](./spec/TECHNICAL_SPEC.md)** - Full architecture details
- **[TODO](./TODO.md)** - Feature roadmap

</td>
</tr>
</table>

---

## 📈 Roadmap

- [x] Agent Templates (default, coder, analyst, researcher)
- [x] GAIA Benchmark for comparing agent CLIs
- [x] JSONL transcript export (debugging / replay)
- [x] Manager CLI (sandagent command)
- [x] Runner CLI (sandagent-runner command)
- [x] Sandock SDK integration
- [x] Vercel deployment workflow
- [ ] Multiple UI stream profiles (web / terminal)
- [ ] Additional agent runtimes (OpenAI, Gemini)
- [ ] Snapshot & restore
- [ ] Volume export

---

## ⚖️ Design Trade-offs

SandAgent intentionally chooses:

| Choice | Result |
|--------|--------|
| ✅ Passthrough | Maximum simplicity |
| ✅ UI-native | Tight AI SDK coupling |
| ✅ No abstraction | Faster iteration |

This makes SandAgent:
- **Extremely easy to integrate**
- **Ideal for AI SDK–based products**

But also means:
- SandAgent is tightly coupled to AI SDK UI
- Non-UI consumers should build their own adapters

**This is a conscious design decision.**

---

## 📄 License

Apache License 2.0

---

<div align="center">
  <p>Made with 🏖️ for the AI community</p>
  
  **SandAgent is a sandboxed Super Agent runtime that speaks AI SDK UI natively.**
</div>
