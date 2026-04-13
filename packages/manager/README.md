# @bunny-agent/manager

> ⚠️ **Deprecated (exec-based transport)**
>
> `@bunny-agent/manager` works by spawning `bunny-agent run` CLI inside a sandbox via `exec()`. This approach is being superseded by **`@bunny-agent/daemon`** — a unified HTTP gateway that runs inside the sandbox and exposes the same capabilities over a clean REST API.
>
> **Prefer `createBunny Agent` with an explicit `daemonUrl` from `@bunny-agent/sdk`** when using the HTTP daemon.
>
> This package remains supported for sandboxes that only provide `exec()` capability (E2B, Daytona, etc.) and has no planned removal date.

Core manager package for Bunny Agent - manages sandbox and runner lifecycle, defines core interfaces.

This package is the core runtime that wires **sandbox adapters** + a **runner spec** into an AI SDK UI stream you can consume from your server or CLI.

## Overview

`@bunny-agent/manager` is the foundational package that provides:

- **Bunny Agent**: Main class for managing sandboxed agent instances
- **Core Interfaces**: `SandboxAdapter`, `SandboxHandle`, `RunnerSpec`, etc.
- **Transcript Writers**: Tools for logging agent execution (JSONL, Memory, Console, Multi)
- **Type Definitions**: Shared types for messages, streams, and sandbox operations

This package is typically used as a dependency by higher-level packages like `@bunny-agent/sdk` and sandbox adapters.

## Installation

```bash
npm install @bunny-agent/manager
```

## Quickstart

### Basic Usage

```typescript
import { Bunny Agent } from '@bunny-agent/manager';
import { E2BSandbox } from '@bunny-agent/sandbox-e2b';

const agent = new Bunny Agent({
  sandbox: new E2BSandbox({ apiKey: 'xxx' }),
  runner: {
    model: 'claude-sonnet-4-20250514',
    outputFormat: 'stream',
  },
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});

// Stream a task
const stream = await agent.stream({
  messages: [
    { role: 'user', content: 'Create a hello world program' }
  ],
  workspace: {
    path: '/workspace',
  },
});

// Read the stream
const reader = stream.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(value);
}

// Cleanup
await agent.destroy();
```

### With Transcript Logging

```typescript
import { Bunny Agent, JsonlTranscriptWriter } from '@bunny-agent/manager';

const transcriptWriter = new JsonlTranscriptWriter('./transcript.jsonl');

const stream = await agent.stream({
  messages: [{ role: 'user', content: 'Do something' }],
  workspace: { path: '/workspace' },
  transcriptWriter,
});
```

### Upload Files

```typescript
await agent.uploadFiles([
  { path: 'hello.txt', content: 'Hello World!' },
  { path: 'data.json', content: JSON.stringify({ key: 'value' }) },
], '/workspace');
```

## Core Interfaces

### SandboxAdapter

Interface that sandbox implementations must follow:

```typescript
interface SandboxAdapter {
  attach(): Promise<SandboxHandle>;
  getHandle(): SandboxHandle | null;
  getEnv?(): Record<string, string>;
  getWorkdir?(): string;
}
```

### SandboxHandle

Interface for interacting with an attached sandbox:

```typescript
interface SandboxHandle {
  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array>;
  upload(files: Array<{ path: string; content: Uint8Array | string }>, targetDir: string): Promise<void>;
  readFile?(filePath: string): Promise<string>;
  runCommand?(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  destroy(): Promise<void>;
  getWorkdir?(): string;
}
```

### RunnerSpec

Specification for the runner to execute inside the sandbox:

```typescript
interface RunnerSpec {
  model: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  outputFormat?: 'stream' | 'json';
}
```

## Transcript Writers

Available transcript writers:

- **JsonlTranscriptWriter**: Write to JSONL file
- **MemoryTranscriptWriter**: Store in memory
- **ConsoleTranscriptWriter**: Log to console
- **MultiTranscriptWriter**: Write to multiple writers

```typescript
import { 
  JsonlTranscriptWriter,
  MemoryTranscriptWriter,
  MultiTranscriptWriter 
} from '@bunny-agent/manager';

const transcriptWriter = new MultiTranscriptWriter([
  new JsonlTranscriptWriter('./transcript.jsonl'),
  new ConsoleTranscriptWriter(),
]);
```

## API Reference

### Bunny Agent

#### Constructor

```typescript
new Bunny Agent(options: Bunny AgentOptions)
```

**Options:**
- `sandbox` (required): A SandboxAdapter instance
- `runner` (required): RunnerSpec configuration
- `env`: Environment variables for the sandbox

#### Methods

**stream(input: StreamInput): Promise<ReadableStream<Uint8Array>>**

Stream a task through the agent. Returns a ReadableStream of AI SDK UI messages.

**uploadFiles(files: Array<{ path: string; content: Uint8Array | string }>, targetDir?: string): Promise<void>**

Upload files to the agent's workspace.

**destroy(): Promise<void>**

Destroy the sandbox and release resources.

## Requirements

- Node.js 20+
- A sandbox adapter (@bunny-agent/sandbox-e2b, @bunny-agent/sandbox-local, etc.)

## License

Apache-2.0
