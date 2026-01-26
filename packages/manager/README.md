# @sandagent/manager

Core manager package for SandAgent - manages sandbox and runner lifecycle, defines core interfaces.

## Overview

`@sandagent/manager` is the foundational package that provides:

- **SandAgent**: Main class for managing sandboxed agent instances
- **Core Interfaces**: `SandboxAdapter`, `SandboxHandle`, `RunnerSpec`, etc.
- **Transcript Writers**: Tools for logging agent execution (JSONL, Memory, Console, Multi)
- **Type Definitions**: Shared types for messages, streams, and sandbox operations

This package is typically used as a dependency by higher-level packages like `@sandagent/ai-provider` and sandbox adapters.

## Installation

```bash
npm install @sandagent/manager
```

## Usage

### Basic Usage

```typescript
import { SandAgent } from '@sandagent/manager';
import { E2BSandbox } from '@sandagent/sandbox-e2b';

const agent = new SandAgent({
  sandbox: new E2BSandbox({ apiKey: 'xxx' }),
  runner: {
    kind: 'claude-agent-sdk',
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
import { SandAgent, JsonlTranscriptWriter } from '@sandagent/manager';

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
  kind: 'claude-agent-sdk' | string;
  model: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  approvalDir?: string;
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
} from '@sandagent/manager';

const transcriptWriter = new MultiTranscriptWriter([
  new JsonlTranscriptWriter('./transcript.jsonl'),
  new ConsoleTranscriptWriter(),
]);
```

## API Reference

### SandAgent

#### Constructor

```typescript
new SandAgent(options: SandAgentOptions)
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
- A sandbox adapter (@sandagent/sandbox-e2b, @sandagent/sandbox-local, etc.)

## License

Apache-2.0
