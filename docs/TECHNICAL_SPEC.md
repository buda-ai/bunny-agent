# Bunny Agent Technical Specification

**For developers who want to understand how Bunny Agent works under the hood**

---

## Overview

Bunny Agent enables you to transform powerful coding agents (like Claude Code) into specialized Super Agents for any vertical use case — without rebuilding the agent from scratch.

This document covers the technical architecture. If you just want to use Bunny Agent, see the [Quick Start Guide](./QUICK_START.md).

---

## 1. Scope & Non-goals

### In Scope

Bunny Agent provides:

* A **persistent agent runtime**
* A **sandboxed execution environment**
* A **filesystem-backed workspace**
* A **CLI-based agent runner**
* **Direct passthrough streaming of AI SDK UI messages**

### Explicit Non-goals

Bunny Agent does **not**:

* define a generic agent event protocol
* translate or reinterpret agent output
* provide a UI-agnostic abstraction
* manage frontend rendering logic

> Bunny Agent is a **runtime + transport**, not an event bus.

---

## 2. High-level Architecture

```text
┌────────────┐
│   Web UI   │
│ (AI SDK)   │
└─────▲──────┘
      │  AI SDK stream
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
│ (Sandock)  │
└─────▲──────┘
      │ exec
      │
┌─────┴──────┐
│   CLI      │
│ bunny-agent  │
└─────▲──────┘
      │
┌─────┴──────┐
│ Claude     │
│ Agent SDK  │
└────────────┘
```

**Invariant**

> Whatever the CLI writes to `stdout`
> **must be a valid AI SDK UI stream**.

---

## 3. Core Abstractions

### 3.1 `Bunny Agent` (Core)

Represents **one persistent agent instance**.

```ts
interface Bunny AgentOptions {
  id: string;                    // identity = sandbox + volume
  sandbox: SandboxAdapter;
  runner: RunnerSpec;
}
```

#### Responsibilities

* bind `id` → sandbox + filesystem volume
* attach or resume sandbox
* execute CLI runner
* stream stdout **without modification**

---

### 3.2 Sandbox Adapter

```ts
interface SandboxAdapter {
  attach(id: string): Promise<SandboxHandle>;
}

interface SandboxHandle {
  exec(
    command: string[],
    opts?: ExecOptions
  ): AsyncIterable<Uint8Array>;

  upload(
    files: Array<{ path: string; content: Uint8Array | string }>,
    targetDir: string
  ): Promise<void>;

  destroy(): Promise<void>;
}
```

#### Requirements

* stdout must be streamable
* filesystem must persist per `id`
* execution must be isolated

---

### 3.3 Runner Specification

```ts
interface RunnerSpec {
  kind: "claude-agent-sdk";
  model: string;
}
```

Runner logic lives **inside the CLI**, not in the server.

---

## 4. CLI Specification (`bunny-agent`)

### 4.1 Execution Model

The CLI is executed **inside the sandbox**.

```bash
bunny-agent run [options] -- "<user input>"
```

The CLI:

1. Initializes the agent runtime (Claude Agent SDK)
2. Feeds user messages
3. Streams **AI SDK UI messages** to stdout
4. Exits when the task completes or errors

---

### 4.2 CLI Output Contract (Critical)

**stdout MUST:**

* be a valid AI SDK UI stream
* preserve message ordering
* flush incrementally (streaming)
* contain no extra logs or noise

```text
stdout = UI stream
stderr = diagnostics only
```

Bunny Agent **must never parse stdout**.

---

### 4.3 CLI Guarantees

* No framing or wrapping
* No protocol translation
* No buffering beyond stream chunks

The CLI is a **pure producer**.

---

### 4.4 CLI Arguments

```bash
bunny-agent run [options] -- "<user input>"
```

**Required:**

| Argument | Description |
| -------- | ----------- |
| `<user input>` | The user's message/task to execute |

**Options:**

| Flag | Description | Default |
| ---- | ----------- | ------- |
| `--model <model>` | Model to use | `claude-sonnet-4-20250514` |
| `--cwd <path>` | Working directory | `/workspace` |
| `--system-prompt <prompt>` | Custom system prompt | Built-in default |
| `--max-turns <n>` | Maximum conversation turns | Unlimited |
| `--allowed-tools <tools>` | Comma-separated tool list | All tools |

**Environment Variables:**

| Variable | Description |
| -------- | ----------- |
| `ANTHROPIC_API_KEY` | Anthropic API key (required) |
| `BUNNY_AGENT_WORKSPACE` | Default workspace path |
| `BUNNY_AGENT_LOG_LEVEL` | Logging level (debug, info, warn, error) |

---

## 5. Server-side Passthrough Contract

### 5.1 `agent.stream()`

```ts
agent.stream(input): Response
```

#### Responsibilities

* call sandbox.exec(...)
* pipe stdout → HTTP response body
* set correct headers for streaming
* never mutate the stream

#### Forbidden

* parsing messages
* injecting UI metadata
* buffering entire output

---

### 5.2 Streaming Semantics

* backpressure-aware
* chunk-preserving
* order-preserving

```text
CLI stdout chunk
   ↓
HTTP chunk
   ↓
Client render
```

---

## 6. Filesystem & Persistence

### Filesystem

* Mounted at a fixed path (e.g. `/workspace`)
* Backed by sandbox volume
* Shared across runs with same `id`

### Identity Semantics

```ts
new Bunny Agent({ id: "project-x" })
```

Means:

> Resume filesystem + execution context for `"project-x"`

---

## 7. Error Handling

### CLI Errors

* Fatal errors → CLI exits non-zero
* Error messages may be streamed as UI messages
* Stack traces should go to `stderr`

### Server Errors

* Sandbox failure → terminate stream
* Network failure → propagate as-is

No error translation layer exists.

---

## 8. Security Model

### Isolation

* All execution occurs inside sandbox
* Server never executes agent code
* Filesystem access is sandbox-scoped

### Capability Control

* Tool availability is determined inside CLI
* Network access is sandbox-configurable

---

## 9. Versioning Strategy

Bunny Agent follows **AI SDK compatibility**:

* CLI output protocol follows AI SDK UI spec
* Breaking changes track AI SDK major versions
* Bunny Agent does not version its own protocol

```text
Bunny Agent vX  →  AI SDK vX
```

---

## 10. Trade-offs (Explicit)

Bunny Agent intentionally trades:

| Choice         | Result                |
| -------------- | --------------------- |
| Passthrough    | Maximum simplicity    |
| UI-native      | Tight AI SDK coupling |
| No abstraction | Faster iteration      |

This is a **deliberate design**, not a limitation.

---

## 11. Testing Requirements

### Mandatory Tests

* stdout passthrough integrity
* streaming under backpressure
* sandbox resume by `id`
* filesystem persistence

### Non-required

* protocol conformance tests (delegated to AI SDK)

---

## 12. Implementation Checklist

- [x] `Bunny Agent` lifecycle implemented
- [x] Sandbox adapter implemented (E2B, Sandock)
- [x] CLI runner streams UI messages
- [x] Server passthrough is zero-copy
- [x] No stdout parsing anywhere
- [x] Persistence verified by re-run
- [x] JSONL transcript export for debugging

---

## One-line Technical Summary

> **Bunny Agent is a sandboxed agent runtime that treats AI SDK UI messages as the execution protocol itself.**
