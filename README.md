<div align="center">
  <img src="docs/bunny-logo.png" alt="Bunny Agent Logo" width="280">

  <h1>Bunny Agent</h1>

  <p><strong>A calm, powerful coding agent — runs anywhere, ships everywhere.</strong></p>

  <p>
    Daily driver CLI &nbsp;·&nbsp; AI SDK UI native &nbsp;·&nbsp; Remote sandbox in one command &nbsp;·&nbsp; Build your own Agent product
  </p>

  [![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg?style=flat-square)](https://www.typescriptlang.org/)
  [![AI SDK](https://img.shields.io/badge/AI%20SDK%20UI-compatible-8b5cf6.svg?style=flat-square)](https://sdk.vercel.ai/)
  [![pnpm](https://img.shields.io/badge/pnpm-9.0+-f97316.svg?style=flat-square)](https://pnpm.io/)
  [![Powered by Pi](https://img.shields.io/badge/powered%20by-pi%20coding%20agent-0ea5e9.svg?style=flat-square)](https://github.com/mariozechner/lemmy)

  [Quick Start](#-quick-start) &nbsp;·&nbsp; [Features](#-features) &nbsp;·&nbsp; [Remote Sandbox](#-one-command-remote-sandbox) &nbsp;·&nbsp; [Build Your Own Agent](#-build-your-own-agent-product) &nbsp;·&nbsp; [Docs](#-documentation)

</div>

---

## What is Bunny Agent?

**Bunny Agent** is a coding agent built on [Pi Coding Agent](https://github.com/mariozechner/lemmy) — multi-model, harness-ready, and designed from the ground up for three jobs at once:

| Mode | What it means |
|------|--------------|
| 🖥️ **Daily CLI agent** | Install and use it like a local coding assistant, today |
| ☁️ **Remote sandbox agent** | `bunny remote my-project` — spin up a cloud machine for $5/mo |
| 🏗️ **Managed agent SDK** | Embed it in your Next.js app and ship an Agent SaaS product |

It outputs a **native AI SDK UI stream** — meaning you can wire it directly into any `useChat()` frontend with zero glue code.

---

## ✨ Features

### 🧠 Multi-Model, One CLI

Switch between Claude, Gemini, OpenAI, or any provider — no code changes required.

```bash
bunny run --runner pi --model google:gemini-2.5-pro   -- "refactor this module"
bunny run --runner claude --model claude-opus-4        -- "review my PR"
bunny run --runner codex                               -- "fix the failing tests"
```

Powered by Pi Coding Agent — think of it as the **oh-my-zsh of coding agents**: pre-wired for every major provider, battle-tested on real engineering tasks.

---

### 🔧 Harness-Ready — Tools Included

No config needed. Bunny ships with a pre-built tool harness:

| Tool | What it does |
|------|-------------|
| 🔍 **Web Search** | Brave / Tavily, auto-detected from env keys |
| 🌐 **Web Fetch** | Full page content extraction |
| 🖼️ **Image Generation** | AI image creation from prompts |
| 🔨 **Bash Execute** | Run shell commands in the sandbox |
| 📁 **File Ops** | Read / write files in the workspace |

Add your own tools by dropping a skill file — the harness discovers them automatically.

---

### 📡 AI SDK UI Native — Zero Glue

Bunny's stdout **is** an AI SDK UI stream. Pipe it to your server, pass it to your client, done.

```typescript
// Next.js API route — this is the entire backend
export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  const agent = new Bunny Agent({
    id: sessionId,
    sandbox: new SandockSandbox(),
    runner: { kind: "pi", model: "google:gemini-2.5-pro" },
  });

  return agent.stream({ messages }); // returns a Response with AI SDK UI stream
}
```

```tsx
// React client — useChat just works
const { messages, input, handleSubmit } = useChat({ api: "/api/agent" });
```

No protocol translation. No buffering. Pure passthrough.

---

### ☁️ One-Command Remote Sandbox

Stop worrying about your laptop's specs. Launch a cloud machine instantly:

```bash
bunny remote my-project
```

That's it. You're now in a remote machine backed by [Sandock](https://sandock.ai):

- ⚡ Fast NVMe SSD
- 🔒 Isolated container, persistent filesystem
- 💰 Starting at **$5 / month**
- ♾️ Launch as many sandboxes as you need — no local resource constraints

Perfect for running heavy tasks, parallel workloads, or keeping your work in the cloud between sessions.

---

### 💾 Persistent Sessions

Every agent run is tied to an `id`. Resume exactly where you left off — same filesystem, same context.

```bash
bunny run --resume my-project -- "continue where we left off"
```

---

## 🚀 Quick Start

### Install

```bash
npm install -g @bunny-agent/runner-cli
```

### Set your API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or for Gemini:
export GEMINI_API_KEY=...
```

### Run your first task

```bash
# Local — uses your current directory
bunny run -- "explain this codebase and suggest improvements"

# Remote — cloud sandbox via Sandock
bunny remote my-project

# Choose a model
bunny run --runner pi --model google:gemini-2.5-pro -- "write unit tests for src/auth.ts"
```

### From source

```bash
git clone https://github.com/vikadata/sandagent.git
cd bunny-agent
pnpm install && pnpm build

cd apps/runner-cli
npx bunny-agent run -- "your task here"
```

---

## ☁️ One-Command Remote Sandbox

```bash
bunny remote <project-name>
```

Under the hood this:
1. Provisions a Sandock container with NVMe storage
2. Mounts a persistent volume for `<project-name>`
3. Drops you into an interactive agent session on that machine

**Run multiple sandboxes in parallel:**

```bash
bunny remote frontend-work    # machine 1
bunny remote backend-api      # machine 2
bunny remote data-pipeline    # machine 3
```

Each runs in full isolation. No config drift, no "works on my machine".

Get a Sandock API key at [sandock.ai](https://sandock.ai) — plans start at $5/month.

---

## 🏗️ Build Your Own Agent Product

### Architecture

```
Your Next.js App
    │
    ├── useChat() ─────────────────────────  React client (AI SDK)
    │
    └── POST /api/agent ──────────────────   your API route
            │
            └── Bunny Agent.stream() ────────  Bunny Agent SDK
                    │
                    ├── runner: pi / claude / codex / gemini
                    │
                    └── sandbox: Sandock / E2B / Daytona / Local
```

### Sandbox options

| Sandbox | Best for | Setup |
|---------|----------|-------|
| **Sandock** | Production cloud, low cost | API key from [sandock.ai](https://sandock.ai) |
| **E2B** | Managed cloud sandboxes | API key from [e2b.dev](https://e2b.dev) |
| **Daytona** | Enterprise / self-hosted | API key from [daytona.io](https://daytona.io) |
| **Local** | Development, no cloud needed | No key required |

Switch with one import — the rest of your code stays unchanged.

```typescript
import { createBunny Agent } from "@bunny-agent/sdk";
import { SandockSandbox } from "@bunny-agent/sandbox-sandock";

const agent = createBunny Agent({
  sandbox: new SandockSandbox(),
  runner: { kind: "pi", model: "anthropic:claude-sonnet-4" },
});

// Returns LanguageModelV3 — compatible with Vercel AI SDK
const model = await agent.getModel();
```

---

## 🔧 CLI Reference

```
bunny run [options] -- "<task>"

Options:
  -r, --runner <name>    Runner: pi | claude | gemini | codex | opencode  (default: claude)
  -m, --model  <model>   Model override  (e.g. google:gemini-2.5-pro)
  -c, --cwd    <path>    Working directory  (default: current dir)
  -s, --system-prompt    Custom system prompt
  -t, --max-turns <n>    Maximum turns
      --resume <session> Resume a previous session
      --yolo             Skip confirmation prompts
  -h, --help             Show help
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude / Anthropic models |
| `GEMINI_API_KEY` | Google Gemini models |
| `OPENAI_API_KEY` | OpenAI models |
| `SANDOCK_API_KEY` | Sandock remote sandbox |
| `E2B_API_KEY` | E2B cloud sandbox |
| `BRAVE_API_KEY` | Brave web search |
| `TAVILY_API_KEY` | Tavily web search (fallback) |

---

## 📦 Packages

| Package | Description |
|---------|-------------|
| `@bunny-agent/sdk` | Embed Bunny in your app |
| `@bunny-agent/runner-harness` | Pre-built tool harness (search, bash, files, image gen) |
| `@bunny-agent/runner-pi` | Pi coding agent runner (multi-model) |
| `@bunny-agent/runner-claude` | Claude Agent SDK runner |
| `@bunny-agent/runner-codex` | OpenAI Codex runner |
| `@bunny-agent/runner-gemini` | Gemini CLI runner |
| `@bunny-agent/sandbox-sandock` | Sandock sandbox adapter |
| `@bunny-agent/sandbox-e2b` | E2B sandbox adapter |
| `@bunny-agent/sandbox-daytona` | Daytona sandbox adapter |
| `@bunny-agent/sandbox-local` | Local sandbox adapter |

---

## 📚 Documentation

- [Quick Start Guide](docs/QUICK_START.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Technical Specification](docs/TECHNICAL_SPEC.md)
- [Sandbox Adapters](docs/SANDBOX_ADAPTERS.md)
- [Persistence Guide](docs/PERSISTENCE_GUIDE.md)
- [API Reference](docs/API_REFERENCE.md)
- [Debugging Guide](docs/DEBUGGING_GUIDE.md)

---

## 📊 Benchmark Results

Bunny Agent is evaluated on the [GAIA benchmark](https://huggingface.co/datasets/gaia-benchmark/GAIA) — a challenging real-world task benchmark designed for general AI assistants.

**Model: Gemini 3.1 Pro (via OpenAI-compatible API)**

| Level | Tasks | Score | Pass Rate |
|-------|-------|-------|-----------|
| **L1** (simple reasoning) | 42 | **34/42** | **81%** |
| **L2** (multi-step) | 66 | **55/66** | **83%** |
| **L3** (complex reasoning) | 19 | **13/19** | **68%** |

> Results are legitimate zero-shot runs (no answer-revealing hints). Scores significantly exceed typical zero-shot baselines (~50–60% L2, ~11–30% L3).

Benchmarks are run using `apps/bunny-bench` — the integrated evaluation harness that ships with this repo. Wrong-answer tracking lets you iterate on failures without re-running solved tasks.

---

## 🤝 Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
pnpm install    # install all workspace dependencies
pnpm build      # build all packages
pnpm test       # run tests
pnpm typecheck  # type-check everything
```

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

---

<div align="center">
  <sub>Built with 🐰 calm energy &nbsp;·&nbsp; Powered by <a href="https://github.com/mariozechner/lemmy">Pi Coding Agent</a></sub>
</div>
