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
  ├─ Isolated sandbox (Sandock / E2B)
  ├─ Dedicated filesystem volume
  ├─ Claude Agent SDK (or other runtimes)
  └─ AI SDK–compatible message stream
```

* Creating a `SandAgent` attaches to a sandbox
* The sandbox owns the filesystem
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
│  ├─ sandbox-e2b/         # E2B adapter
│  └─ runner-claude/       # Claude Agent SDK runtime
├─ examples/
│  └─ nextjs-app/
└─ README.md
```

---

## High-level API

### Creating a SandAgent

```ts
import { SandAgent } from "@sandagent/core";
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const agent = new SandAgent({
  id: "user-123-project-a",
  sandbox: new SandockSandbox(),
  runner: {
    kind: "claude-agent-sdk",
    model: "claude-3-5-sonnet",
  },
});
```

* `id` identifies the sandbox and filesystem
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

## Next.js + AI SDK Example

### `/app/api/ai/route.ts`

```ts
import { SandAgent } from "@sandagent/core";
import { SandockSandbox } from "@sandagent/sandbox-sandock";

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  const agent = new SandAgent({
    id: sessionId,
    sandbox: new SandockSandbox(),
    runner: {
      kind: "claude-agent-sdk",
      model: "claude-3-5-sonnet",
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
  --model claude-3-5-sonnet \
  --cwd /workspace \
  -- "Create a weather script and run it"
```

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

- [ ] Optional JSONL transcript export (debugging / replay)
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

## One-line takeaway

> **SandAgent is a sandboxed Super Agent runtime that speaks AI SDK UI natively.**

---

## License

Apache 2.0