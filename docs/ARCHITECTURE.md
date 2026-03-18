# SandAgent Architecture

## Full System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              External Callers                                   │
│                                                                                 │
│   buda.im (Next.js)                    Developer / CI                           │
│   ┌──────────────────┐                 ┌──────────────────┐                    │
│   │  @sandagent/sdk  │                 │   runner-cli     │                    │
│   │  createSandAgent │                 │   sandagent run  │                    │
│   │  createSandAgent │                 │   --runner claude│                    │
│   │  Daemon()        │                 │   -- "task"      │                    │
│   └────────┬─────────┘                 └────────┬─────────┘                    │
└────────────┼────────────────────────────────────┼─────────────────────────────┘
             │                                    │
             │ HTTP / embed                       │ stdout (NDJSON stream)
             ▼                                    │
┌────────────────────────────────────────────────┼─────────────────────────────┐
│                    apps/daemon                  │                             │
│                                                 │                             │
│  ┌──────────────────────────────────────────┐   │                             │
│  │  Mode A: standalone :3080                │   │                             │
│  │  (container / local process)             │   │                             │
│  │                                          │   │                             │
│  │  POST /api/sandagent/run  (SSE stream)   │   │                             │
│  │  GET|POST /api/fs/*                      │   │                             │
│  │  GET|POST /api/git/*                     │   │                             │
│  │  GET|POST /api/volumes/*                 │   │                             │
│  │  GET /healthz                            │   │                             │
│  └──────────────────────────────────────────┘   │                             │
│                                                 │                             │
│  ┌──────────────────────────────────────────┐   │                             │
│  │  Mode B: Next.js embed                   │   │                             │
│  │  createNextHandler({ root })             │   │                             │
│  │  → app/api/daemon/[...path]/route.ts     │   │                             │
│  └──────────────────────────────────────────┘   │                             │
│                         │                       │                             │
└─────────────────────────┼───────────────────────┼─────────────────────────────┘
                          │                       │
                          └──────────┬────────────┘
                                     │ uses
                                     ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                         packages/runner-core                                   │
│                                                                                │
│   createRunner(options) → AsyncIterable<string>                                │
│   Pure dispatch — no I/O, no stdout, no HTTP                                   │
│                                                                                │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │runner-claude │  │  runner-pi   │  │runner-gemini │  │ runner-codex │     │
│   │(claude agent │  │(multi-model) │  │(gemini CLI)  │  │(openai codex)│     │
│   │    sdk)      │  │              │  │              │  │              │     │
│   └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## SDK Transport Modes

```
@sandagent/sdk
│
├── createSandAgent({ sandbox })          ← manager + sandbox transport
│   │
│   └── @sandagent/manager
│       └── SandAgent.stream()
│           └── spawns runner-cli inside sandbox
│               └── sandbox: E2B / Sandock / Local / Daytona
│
└── createSandAgentDaemon({ daemonUrl })  ← daemon HTTP transport
    │
    └── fetch POST /api/sandagent/run
        └── apps/daemon
            └── runner-core
```

Both return `LanguageModelV3` — swap transports without changing any other code.

---

## Deployment: Container (Production)

```
sandbox container
│
├── chromium --headless :9222        (CDP, optional)
│
└── sandagent-daemon :3080           (unified gateway)
    ├── /api/fs/*      → node:fs
    ├── /api/git/*     → spawn git
    ├── /api/volumes/* → node:fs
    └── /api/sandagent/run → runner-core → claude/pi/gemini/...
```

External access via sandock.ai proxy:
```
buda.im → sandock.ai/api/v1/sandbox/http/proxy/{id}/3080/api/fs/read?path=...
```

---

## Deployment: Local / Next.js Embed

```
buda.im Next.js app (~/Documents/kapps/apps/buda)
│
└── app/api/daemon/[...path]/route.ts
    └── createNextHandler({ root: process.cwd() })
        └── DaemonRouter (in-process, no HTTP)
            ├── /api/fs/*
            ├── /api/git/*
            └── /api/volumes/*
```

No extra process. Daemon logic runs inside Next.js.

---

## Package Dependency Graph

```
apps/
├── daemon          → runner-core
├── runner-cli      → runner-core
└── manager-cli     → manager + runner-* + sandbox-*

packages/
├── runner-core     → runner-claude, runner-pi, runner-gemini, runner-codex, runner-opencode
├── sdk             → manager  (createSandAgent)
│                   → [no dep] (createSandAgentDaemon — just fetch)
├── manager         → (no deps, defines Runner + SandboxAdapter interfaces)
├── runner-claude   → @anthropic-ai/claude-agent-sdk
├── runner-pi       → @mariozechner/pi-coding-agent
├── runner-gemini   → gemini CLI (headless)
├── runner-codex    → @openai/codex-sdk
├── sandbox-e2b     → e2b SDK
├── sandbox-sandock → sandock SDK
├── sandbox-local   → node stdlib only
└── sandbox-daytona → @daytonaio/sdk
```
