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
| **sandagent-example** | Complete Next.js web app with AI chat UI | First-time users, web integration |
| **manager-cli** | Command-line sandbox management | DevOps, server-side orchestration |
| **runner-cli** | Terminal-based agent (like claude-code, gemini-cli) | Local development, CLI enthusiasts |

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

### Option D: Use Claude Code Directly

Since SandAgent templates are compatible with Claude Code, you can use them directly:

```bash
# Install Claude Code CLI (if not already installed)
npm install -g @anthropic-ai/claude-code

# Navigate to a template directory
cd templates/coder

# Run Claude Code with the template's configuration
claude "Build a REST API with Express"
```

The template's `CLAUDE.md` and `.claude/` configuration will be automatically picked up by Claude Code.

### Option E: Run Tests

Verify everything works without needing API keys:

```bash
pnpm install && pnpm build
pnpm test  # 93 tests
```

---

## 🏗️ How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Your Template (CLAUDE.md + skills/)                        │
│  "You are a data analyst specializing in SQL and Python..." │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Coding Agent (Claude Code / Codex CLI)                     │
│  Memory ✓  Tools ✓  MCP ✓  Prompts ✓                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Sandbox (E2B / Sandock)                                    │
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

Templates are the heart of SandAgent — they turn a general coding agent into a specialized Super Agent.

| Template | Description | Example Tasks |
|----------|-------------|---------------|
| `default` | General-purpose assistant | Any task |
| `coder` | Software development | Code review, debugging, refactoring |
| `analyst` | Data analysis | SQL queries, data cleaning, visualization |
| `researcher` | Web research | Information gathering, fact-checking |
| `seo-agent` | SEO optimization | Keyword research, content optimization |

### Creating Your Own Template

It's just a folder with markdown files:

```
my-agent/
├── CLAUDE.md              # System instructions (who is this agent?)
├── skills/                # Domain knowledge files
│   ├── sql-patterns.md
│   └── data-viz-guide.md
└── .claude/
    └── settings.json      # Model configuration
```

**Example CLAUDE.md:**

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

That's it. No SDK code. No tool definitions. No memory management.

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
