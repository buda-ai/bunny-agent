# Bunny Agent Architecture

## Full System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              External Callers                                   │
│                                                                                 │
│   buda.im (Next.js)                    Developer / CI                           │
│   ┌──────────────────┐                 ┌──────────────────┐                    │
│   │  @bunny-agent/sdk  │                 │   runner-cli     │                    │
│   │  createBunny Agent │                 │   bunny-agent run  │                    │
│   │  createBunny Agent │                 │   --runner claude│                    │
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
│  │  POST /api/bunny-agent/run  (SSE stream)   │   │                             │
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
@bunny-agent/sdk
│
├── createBunny Agent({ sandbox })          ← manager + sandbox transport
│   │
│   └── @bunny-agent/manager
│       └── Bunny Agent.stream()
│           └── spawns runner-cli inside sandbox
│               └── sandbox: E2B / Sandock / Local / Daytona
│
└── createBunny Agent({ sandbox, daemonUrl })  ← daemon HTTP inside sandbox
    │
    └── streamCodingRunFromSandbox (curl POST /api/coding/run in VM)
        └── apps/daemon (@bunny-agent/daemon)
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
└── bunny-agent-daemon :3080           (unified gateway)
    ├── /api/fs/*      → node:fs
    ├── /api/git/*     → spawn git
    ├── /api/volumes/* → node:fs
    └── /api/bunny-agent/run → runner-core → claude/pi/gemini/...
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
├── sdk             → manager  (createBunny Agent; daemon path uses fetch only)
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
