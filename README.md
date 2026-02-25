<div align="center">
  <img src="spec/logo.svg" alt="SandAgent Logo" width="200" height="200">
  
  # SandAgent
  
  ### 🏖️ Turn powerful coding agents into universal Super Agents
  
  **Transform Claude Code, Codex CLI, and other coding agents into domain-specific Super Agents**  
  No SDK integration. No context engineering. Just templates.
  
  [![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg?style=flat-square)](https://www.typescriptlang.org/)
  [![AI SDK](https://img.shields.io/badge/AI_SDK-v6-purple.svg?style=flat-square)](https://sdk.vercel.ai/)
  [![pnpm](https://img.shields.io/badge/pnpm-9.0+-orange.svg?style=flat-square)](https://pnpm.io/)
  
  [Quick Start](#-quick-start) · [Why SandAgent](#-why-sandagent) · [Use Cases](#-use-cases) · [Documentation](#-documentation)
  
</div>

---

## 🎯 Why SandAgent?

### 🌟 The Problem: Building Agents is Hard

Building production-ready AI agents with traditional SDK approaches is **painful**:

| Challenge | What You Have to Do |
|-----------|---------------------|
| 🧠 Memory | Implement conversation history, context windows, summarization |
| 🔧 Tool Integration | Write tool definitions, handle responses, manage state |
| 🔌 MCP Servers | Configure, connect, and maintain MCP server integrations |
| 📝 Prompt Engineering | Craft system prompts, handle edge cases, iterate endlessly |
| 🏗️ Infrastructure | Set up sandboxes, manage filesystems, handle persistence |

**Result:** Months of work before you can even start on your actual use case.

### ✅ SandAgent's Solution: Reuse Coding Agents

**What if you could skip all that complexity?**

Coding agents like **Claude Code** and **Codex CLI** have already solved these problems:
- ✅ Sophisticated memory and context management
- ✅ Battle-tested tool implementations (bash, file operations, web search)
- ✅ MCP server ecosystem
- ✅ Refined prompts from millions of interactions

**SandAgent lets you harness this power for ANY vertical use case.**

<table>
<tr>
<td>

### ❌ Traditional SDK Approach
```
6+ months of development:
├── Memory system
├── Tool implementations  
├── MCP integrations
├── Prompt engineering
├── Sandbox infrastructure
└── Still debugging edge cases...
```

</td>
<td>

### ✅ With SandAgent
```
1 day to production:
├── Pick a template (coder/analyst/researcher)
├── Customize CLAUDE.md prompt
├── Deploy
└── Done! 🎉
```

</td>
</tr>
</table>

**The insight:** Don't rebuild the agent — just redirect it.

---

## 🚀 Use Cases

SandAgent transforms coding agents into specialized Super Agents:

| Use Case | Template | What It Does |
|----------|----------|--------------|
| 🔬 **Data Analyst** | `analyst` | SQL queries, data cleaning, visualization, report generation |
| 🔍 **Research Assistant** | `researcher` | Web research, source evaluation, summarization, fact-checking |
| 💻 **Code Assistant** | `coder` | Code review, debugging, refactoring, documentation |
| 📈 **SEO Agent** | `seo-agent` | Keyword research, content optimization, competitor analysis |
| 🎨 **Content Creator** | Custom | Blog writing, social media, copywriting |
| 📊 **Business Analyst** | Custom | Market research, financial modeling, competitive analysis |

**Create your own:** Just write a `CLAUDE.md` file describing your agent's role and skills.

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎯 Template-Based Agents
Define agents with simple markdown files — no code required

### 🏖️ Sandboxed Execution
Isolated containers with real filesystems for safe execution

### 💾 Persistent Sessions
Resume agent sessions with full filesystem continuity

### 📦 Pre-built Templates
Ready-to-use coder, analyst, researcher, SEO templates

</td>
<td width="50%">

### ⚙️ Swappable Sandboxes
E2B cloud or Sandock (Docker) — switch with one line

### 🌐 Web + CLI
Complete Next.js app and terminal-based runners

### 🎯 GAIA Benchmark
Compare performance across different agent CLIs

### 📝 Debug Tools
JSONL transcript recording for debugging and replay

</td>
</tr>
</table>

---

## 🚀 Quick Start

### Understanding the Apps

| App | What it is | Best for |
|-----|------------|----------|
| **web** | Official documentation website built with Fumadocs | Learning, documentation |
| **manager-cli** | Command-line sandbox management (`sandagent-manager`) | DevOps, server-side orchestration |
| **runner-cli** | Terminal-based agent runner (`sandagent`) - choose Claude, Codex, or Copilot | Local development, CLI enthusiasts |

### Option A: Documentation Site

**apps/web** is the official documentation website:

```bash
# Start the documentation site
cd apps/web
pnpm dev
```

Open http://localhost:3000

### Option B: Manager CLI

```bash
# After building (see Option A)
cd apps/manager-cli && pnpm build

# Set environment variables
export ANTHROPIC_API_KEY=your_key
export E2B_API_KEY=your_e2b_key

# Run an agent task
npx sandagent-manager run "Create a hello world script"

# Run with a specific template
npx sandagent-manager run --template coder "Build a REST API"

# List available templates
npx sandagent-manager templates
```

### Option C: Runner CLI

```bash
# After building (see Option A)
cd apps/runner-cli && pnpm build

# Set environment variables
export ANTHROPIC_API_KEY=your_key

# Run with Claude (default)
cd templates/coder
npx sandagent run -- "Build a REST API with Express"

# Or explicitly choose a runner
npx sandagent run --runner claude -- "Build a REST API with Express"

# Future: Use Codex or Copilot
# npx sandagent run --runner codex -- "Build a REST API with Express"
# npx sandagent run --runner copilot -- "Build a REST API with Express"
```

**Key Feature**: runner-cli is a universal CLI that can run different agent backends (Claude, Codex, Copilot) with the same interface!

### Option D: Use Claude Code Directly

Since SandAgent templates are fully compatible with Claude Code, you can use them directly without any wrapper:

```bash
# Navigate to a template directory
cd templates/coder

# Run Claude Code - it automatically picks up the template configuration
claude "Build a REST API with Express"
```

**What Claude Code reads from the template:**

| File/Folder | Purpose |
|-------------|---------|
| `CLAUDE.md` | System instructions — defines who the agent is |
| `.claude/settings.json` | Model settings, allowed tools, timeouts |
| `.claude/mcp.json` | MCP server integrations (databases, APIs, etc.) |
| `skills/` | Agent Skills — modular capabilities with `SKILL.md` files |

**This is the power of SandAgent:** Your templates work with Claude Code out of the box. No vendor lock-in.

📖 **Official Claude Code Docs:**
- [Agent Skills](https://code.claude.com/docs/en/skills) — Package expertise into discoverable capabilities
- [MCP Configuration](https://docs.claude.com/en/docs/claude-code/cli-reference) — Extend Claude with external tools
- [CLAUDE.md Guide](https://docs.claude.com/en/docs/claude-code) — Project-specific instructions

### Option E: Run Tests

Verify everything works without needing API keys:

```bash
pnpm install && pnpm build
pnpm test  # 93 tests
```

### Option F: SDK Development Mode

Integrate SandAgent as an SDK into your own project to build custom AI-powered applications.

```bash
npm install @sandagent/sdk ai
```

This allows you to:
- Add AI agent capabilities to existing projects
- Customize sandbox environments
- Build production-ready AI features
- Integrate with your own backend infrastructure

📖 **For detailed SDK integration guide, see [SDK Quick Start](https://sandagent.dev/docs/quick-start) and [SDK Development Guide](https://sandagent.dev/docs/sdk-guide)**

---

## 🏗️ How It Works

SandAgent acts as a **universal adapter** that redirects coding agents to your use case:

```
┌─────────────────────────────────────────────────────────────┐
│  Your Template (CLAUDE.md + skills/)                        │
│  "You are a data analyst specializing in SQL and Python..." │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Runner (Claude Code / Codex CLI / GitHub Copilot)          │
│  Memory ✓  Tools ✓  MCP ✓  Prompts ✓                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Manager (@sandagent/manager)                               │
│  Orchestrates runner ↔ sandbox lifecycle                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Sandbox (E2B / Sandock / Local / Daytona)                  │
│  Isolated filesystem, persistent state, safe execution      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Your App (Web UI / CLI / API)                              │
│  AI SDK compatible streaming                                │
└─────────────────────────────────────────────────────────────┘
```

**You focus on the template. SandAgent handles everything else.**

### 🔌 Pluggable Architecture

The power of SandAgent comes from its **interface-driven, pluggable design**:

#### 1. Manager Layer (`@sandagent/manager`)

The core orchestrator that:
- Defines `Runner` and `SandboxAdapter` interfaces
- Manages session lifecycle and state
- Binds runners to sandboxes
- **Has zero dependencies** — only defines contracts

```typescript
// What manager provides
export interface Runner {
  run(input: string, options?: RunOptions): AsyncIterable<RunnerOutput>;
}

export interface SandboxAdapter {
  attach(id: string): Promise<SandboxHandle>;
}

export class SandAgentManager {
  constructor(options: {
    runner: Runner;           // Accept any runner implementation
    sandbox: SandboxAdapter;  // Accept any sandbox implementation
  })
}
```

#### 2. Runner Implementations

Runners execute the actual agent logic. Each runner is **independent** and implements the `Runner` interface:

| Package | What It Runs | Status |
|---------|--------------|--------|
| `@sandagent/runner-claude` | Claude Agent SDK | ✅ Production |
| `@sandagent/runner-codex` | Codex CLI | 🚧 Planned |
| `@sandagent/runner-copilot` | GitHub Copilot | 🚧 Planned |

```typescript
// Runners don't depend on manager - just implement the interface
export class ClaudeRunner {
  async *run(input: string, options?: RunOptions) {
    // Execute using @anthropic-ai/claude-agent-sdk
  }
}
```

#### 3. Sandbox Implementations

Sandboxes provide isolated execution environments. Each sandbox is **independent** and implements the `SandboxAdapter` interface:

| Package | Provider | Best For |
|---------|----------|----------|
| `@sandagent/sandbox-e2b` | E2B Cloud | Production, cloud-native |
| `@sandagent/sandbox-sandock` | Sandock | Development, Docker-based |
| `@sandagent/sandbox-local` | Local FS | Testing, no isolation |
| `@sandagent/sandbox-daytona` | Daytona | Enterprise workspaces |

```typescript
// Sandboxes don't depend on manager - just implement the interface
export class E2BSandbox {
  async attach(id: string): Promise<SandboxHandle> {
    // Create/connect to E2B sandbox
  }
}
```

#### 4. Application Layer

Applications combine runners and sandboxes through the manager:

```typescript
// In manager-cli, or your own app
import { SandAgentManager } from '@sandagent/manager';
import { ClaudeRunner } from '@sandagent/runner-claude';
import { E2BSandbox } from '@sandagent/sandbox-e2b';

const manager = new SandAgentManager({
  runner: new ClaudeRunner(),
  sandbox: new E2BSandbox()
});

// Or mix and match different combinations
const localDev = new SandAgentManager({
  runner: new ClaudeRunner(),
  sandbox: new LocalSandbox()  // For local testing
});
```

**runner-cli Example**: The `sandagent` command is a **lightweight, local CLI** that:

- 🚀 Runs directly on your **local filesystem** (no sandbox needed)
- 🔌 Lets you **choose different runners** with `--runner` flag
- 💡 Does **not** use manager (no sandbox orchestration)
- 🏃 Perfect for local development and testing

```bash
# Choose Claude runner (default) - runs on local filesystem
sandagent run -- "Create a hello world script"

# Explicitly select runner
sandagent run --runner claude -- "Build an API"
sandagent run --runner codex -- "Build an API"    # (planned)
sandagent run --runner copilot -- "Build an API"  # (planned)
```

**Key Difference**:
- `runner-cli` → Direct runner usage, local filesystem, no isolation
- `manager-cli` → Uses manager + sandbox for isolated execution

### 🎯 Why This Architecture?

✅ **No Circular Dependencies**: Manager defines interfaces, implementations don't know about manager  
✅ **Type-Safe**: TypeScript structural typing ensures compatibility  
✅ **Extensible**: Add new runners or sandboxes without touching core code  
✅ **Testable**: Mock runners/sandboxes easily for testing  
✅ **Flexible**: Mix any runner with any sandbox  

**Example: Adding a New Runner**

```typescript
// 1. Create a new package implementing Runner interface
export class GeminiRunner {
  async *run(input: string, options?: RunOptions) {
    // Your Gemini implementation
  }
}

// 2. Use it immediately - no changes to manager needed!
const manager = new SandAgentManager({
  runner: new GeminiRunner(),  // ✅ Just works
  sandbox: new E2BSandbox()
});
```

---

## 📦 Monorepo Structure

```
sandagent/
├─ apps/
│  ├─ web/                # Official documentation website
│  ├─ manager-cli/         # sandagent-manager command - manage sandboxes
│  └─ runner-cli/          # sandagent command - universal terminal agent runner (choose claude/codex/copilot)
├─ packages/
│  ├─ manager/             # Core orchestration & interface definitions
│  ├─ sdk/                # SDK for product integration
│  ├─ runner-claude/       # Claude Agent SDK runtime
│  ├─ sandbox-local/       # Local filesystem sandbox adapter
│  ├─ sandbox-e2b/         # E2B cloud sandbox adapter
│  ├─ sandbox-sandock/     # Sandock cloud sandbox adapter
│  ├─ sandbox-daytona/     # Daytona sandbox adapter
│  ├─ kui/                 # UI components
│  └─ benchmark/           # GAIA benchmark for comparing agents
├─ templates/
│  ├─ default/             # General-purpose agent template
│  ├─ coder/               # Software development focused
│  ├─ analyst/             # Data analysis optimized
│  └─ researcher/          # Web research capabilities
└─ spec/                   # Documentation and specifications
```

### 🏗️ Package Architecture & Dependencies

SandAgent follows a **clean, pluggable architecture** where components are loosely coupled through interfaces:

```
┌─────────────────────────────────────────────────────────────┐
│                   Applications Layer                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ web         │    │ manager-cli  │    │  runner-cli  │  │
│  │ (docs)      │    │              │    │  (sandagent) │  │
│  │              │    │              │    │  Choose:     │  │
│  │              │    │              │    │  -r claude   │  │
│  └─────────────┘    └──────┬───────┘    │  -r codex    │  │
│                              use manager    │  -r copilot  │  │
│                                            └──────┬───────┘  │
│                                                   │ direct    │
└───────────────────────────────────────────────────────────┼───────────┘
                              │                    │
                              │ uses               │ uses
                              ↓                    │
┌─────────────────────────────────────────────────┼───────────┐
│                   Core Manager Layer             │           │
├──────────────────────────────────────────────────┼───────────┤
│                                                  │           │
│              ┌─────────────────────────┐         │           │
│              │  @sandagent/manager     │         │           │
│              │                         │         │           │
│              │  Defines interfaces:    │         │           │
│              │  • Runner               │         │           │
│              │  • SandboxAdapter       │         │           │
│              │                         │         │           │
│              │  Manages:               │         │           │
│              │  • Lifecycle            │         │           │
│              │  • Session state        │         │           │
│              │  • Runner ↔ Sandbox     │         │           │
│              └────────────┬────────────┘         │           │
│                           │                      │           │
└───────────────────────────┼──────────────────────┼───────────┘
                            │                      │
                            │ accepts              │ uses directly
             ┌──────────────┴──────────┐           │
             │                         │           │
             ↓                         ↓           ↓
┌────────────────────────┐  ┌────────────────────────────┐
│   Sandbox Adapters     │  │   Runner Adapters          │
├────────────────────────┤  ├────────────────────────────┤
│ • sandbox-local        │  │ • runner-claude   ✅       │
│ • sandbox-e2b          │  │ • runner-codex    🚧       │
│ • sandbox-sandock      │  │ • runner-copilot  🚧       │
│ • sandbox-daytona      │  │                            │
└────────────────────────┘  └────────────────────────────┘
         ↑                            ↑
         └──── Implement interfaces ──┘
         (used by manager)    (used by manager OR directly)
```

### 📋 Package Dependency Flow

```
Applications (different use cases):
├─ manager-cli      → manager + runner-* + sandbox-*
│                     (manages sandbox sessions)
│
└─ runner-cli       → runner-* ONLY (NO manager, NO sandbox)
                      Runs directly on local filesystem
                      Choose via --runner flag:
                      • runner-claude ✅
                      • runner-codex 🚧
                      • runner-copilot 🚧

Core (defines contracts for apps that need sandboxes):
└─ manager          → (no dependencies, only interfaces)

Runner Implementations (can be used directly OR via manager):
├─ runner-claude    → @anthropic-ai/claude-agent-sdk
├─ runner-codex     → (TODO) codex SDK
└─ runner-copilot   → (TODO) copilot SDK

Sandbox Implementations (only used via manager):
├─ sandbox-local    → node.js stdlib only
├─ sandbox-e2b      → e2b SDK
├─ sandbox-sandock  → sandock SDK
└─ sandbox-daytona  → @daytonaio/sdk
```

**Key Design Principles:**

1. **Interface-Driven**: `manager` defines `Runner` and `SandboxAdapter` interfaces
2. **Zero Circular Dependencies**: Implementations don't depend on `manager`
3. **Pluggable**: Any runner can work with any sandbox (via manager) OR standalone
4. **Flexible Usage**:
   - Runners can be used **directly** (runner-cli) for local development
   - Or via **manager** (manager-cli) for sandboxed execution
5. **Type-Safe**: TypeScript structural typing ensures compatibility

**Example Usage:**

```typescript
import { SandAgentManager } from '@sandagent/manager';
import { ClaudeRunner } from '@sandagent/runner-claude';
import { E2BSandbox } from '@sandagent/sandbox-e2b';

// Mix and match implementations
const manager = new SandAgentManager({
  runner: new ClaudeRunner({ model: 'claude-sonnet-4-20250514' }),
  sandbox: new E2BSandbox()
});

// Or use different combinations
const localManager = new SandAgentManager({
  runner: new ClaudeRunner(),
  sandbox: new LocalSandbox()
});
```

---

## 🔧 Core API

### Creating a SandAgent

```typescript
import { SandAgent } from "@sandagent/manager";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { ClaudeRunner } from "@sandagent/runner-claude";

const agent = new SandAgent({
  id: "user-123-project-a",
  sandbox: new E2BSandbox(),  // Recommended default
  runner: new ClaudeRunner({
    model: "claude-sonnet-4-20250514",
    template: "coder",
  }),
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

Templates are the heart of SandAgent — they turn a general coding agent into a specialized Super Agent.

| Template | Description | Example Tasks |
|----------|-------------|---------------|
| `default` | General-purpose assistant | Any task |
| `coder` | Software development | Code review, debugging, refactoring |
| `analyst` | Data analysis | SQL queries, data cleaning, visualization |
| `researcher` | Web research | Information gathering, fact-checking |
| `seo-agent` | SEO optimization | Keyword research, content optimization |

### Template Structure

```
my-agent/
├── CLAUDE.md              # System instructions (who is this agent?)
├── skills/                # Agent Skills — modular capabilities
│   ├── sql-expert/
│   │   └── SKILL.md       # SQL query patterns and best practices
│   └── data-viz/
│       └── SKILL.md       # Visualization guidelines
└── .claude/
    ├── settings.json      # Model configuration, allowed tools
    └── mcp.json           # MCP server integrations
```

### CLAUDE.md — Define Your Agent

```markdown
# Data Analyst Agent

You are an expert data analyst specializing in:
- SQL query optimization
- Python data analysis (pandas, numpy)
- Data visualization (matplotlib, plotly)

## Your Workflow
1. Understand the data structure first
2. Write clean, documented SQL/Python
3. Always validate results before presenting
4. Create clear visualizations with proper labels
```

### skills/ — Add Modular Capabilities

Skills are auto-discovered by Claude when relevant. Each skill has a `SKILL.md`:

```markdown
---
description: "SQL query optimization patterns. Use when writing or reviewing SQL queries."
---

# SQL Expert Skill

## Query Optimization Patterns
- Always use indexes on WHERE clauses
- Prefer JOINs over subqueries for large datasets
- Use EXPLAIN ANALYZE to verify query plans
```

### .claude/mcp.json — Integrate External Tools

Connect to databases, APIs, and other services:

```json
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

**No SDK code. No tool definitions. No memory management.**

📖 **[Templates Guide →](./templates/README.md)** | **[Claude Code Skills Docs →](https://code.claude.com/docs/en/skills)**

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
- **[SDK Quick Start](https://sandagent.dev/docs/quick-start)** - 5-minute SDK integration
- **[Artifacts Feature Guide](https://sandagent.dev/docs/artifacts)** - Display AI-generated content (reports, charts, files)
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
- [x] Manager CLI (sandagent-manager command)
- [x] Runner CLI (sandagent command)
- [x] Sandock SDK integration
- [x] Vercel deployment workflow
- [ ] Multiple UI stream profiles (web / terminal)
- [ ] Additional agent runtimes (OpenAI, Gemini)
- [ ] Snapshot & restore
- [ ] Volume export

---

## ⚖️ Design Philosophy

SandAgent is built on one key insight:

> **Don't rebuild the agent — redirect it.**

| Principle | What It Means |
|-----------|---------------|
| 🎯 Templates over Code | Define agents with markdown, not SDK integrations |
| 🔄 Reuse over Rebuild | Leverage existing coding agents instead of building from scratch |
| 🏖️ Isolation by Default | Every agent runs in a sandboxed environment |
| 📝 Simplicity over Flexibility | Optimized for the 90% use case |

**Best for:**
- Teams who want to ship AI features fast
- Developers familiar with Claude Code or similar tools
- Products built on AI SDK / Vercel AI

**Not ideal for:**
- Highly custom agent architectures
- Non-Claude agent runtimes (coming soon)

---

## 📄 License

Apache License 2.0

---

<div align="center">
  <p>Made with 🏖️ for the AI community</p>
  
  **Turn powerful coding agents into Super Agents for any use case.**
</div>
