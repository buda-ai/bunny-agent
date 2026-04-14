# API Reference

**Complete API documentation for Bunny Agent**

This reference is for developers integrating Bunny Agent into their applications. If you're just getting started, see the [Quick Start Guide](./QUICK_START.md) first.

---

## Quick Example

```typescript
import { Bunny Agent } from "@bunny-agent/core";
import { E2BSandbox } from "@bunny-agent/sandbox-e2b";

// Create a specialized agent with one template
const agent = new BunnyAgent({
  id: "user-123-session",
  sandbox: new E2BSandbox(),
  runner: {
    kind: "claude-agent-sdk",
    model: "claude-sonnet-4-20250514",
    template: "analyst",  // Data analyst agent
  },
});

// Stream a task - returns AI SDK compatible response
const response = await agent.stream({
  messages: [{ role: "user", content: "Analyze this CSV data" }],
});
```

---

## @bunny-agent/core

The core package provides the main `Bunny Agent` class and type definitions.

### Bunny Agent

The main class for creating and managing agent instances.

```ts
import { Bunny Agent } from "@bunny-agent/core";
```

#### Constructor

```ts
new BunnyAgent(options: BunnyAgentOptions)
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options.id` | `string` | Unique identifier for the agent (determines sandbox + volume) |
| `options.sandbox` | `SandboxAdapter` | Sandbox adapter instance |
| `options.runner` | `RunnerSpec` | Runner configuration |

**Example:**

```ts
const agent = new BunnyAgent({
  id: "user-123-project-a",
  sandbox: new SandockSandbox(),
  runner: {
    kind: "claude-agent-sdk",
    model: "claude-sonnet-4-20250514",
  },
});
```

#### Methods

##### `getId(): string`

Returns the agent's unique identifier.

```ts
const id = agent.getId();
console.log(id); // "user-123-project-a"
```

##### `stream(input: StreamInput): Promise<Response>`

Streams a task execution and returns an AI SDK UI compatible Response.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `input.messages` | `Message[]` | Messages to send to the agent |
| `input.workspace` | `{ path?: string }` | Workspace configuration (optional) |
| `input.contentType` | `string` | Response content type (optional, default: `"text/event-stream"`) |

**Returns:** `Promise<Response>` - A Response with streaming body.

**Example:**

```ts
const response = await agent.stream({
  messages: [
    { role: "user", content: "Create a hello world script" },
  ],
  workspace: { path: "/workspace" },
});
```

##### `uploadFiles(files: FileUpload[], targetDir?: string): Promise<void>`

Uploads files to the agent's workspace.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `files` | `Array<{ path: string; content: Uint8Array \| string }>` | Files to upload |
| `targetDir` | `string` | Target directory (optional, default: `"/workspace"`) |

**Example:**

```ts
await agent.uploadFiles([
  { path: "README.md", content: "# Hello World" },
  { path: "src/index.ts", content: "console.log('Hello');" },
]);
```

##### `destroy(): Promise<void>`

Destroys the sandbox and releases resources.

**Example:**

```ts
await agent.destroy();
```

---

### Types

#### BunnyAgentOptions

```ts
interface BunnyAgentOptions {
  /** Unique identifier for the agent */
  id: string;
  /** Sandbox adapter to use */
  sandbox: SandboxAdapter;
  /** Runner specification */
  runner: RunnerSpec;
}
```

#### RunnerSpec

```ts
interface RunnerSpec {
  /** The type of runner */
  kind: "claude-agent-sdk";
  /** The model to use */
  model: string;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Maximum number of conversation turns */
  maxTurns?: number;
  /** Allowed tools (undefined means all tools) */
  allowedTools?: string[];
}
```

#### Message

```ts
interface Message {
  /** Role of the message sender */
  role: "user" | "assistant" | "system";
  /** Content of the message */
  content: string;
}
```

#### StreamInput

```ts
interface StreamInput {
  /** Messages to send to the agent */
  messages: Message[];
  /** Workspace configuration */
  workspace?: {
    /** Path to the workspace directory */
    path?: string;
  };
  /** Content type for the response */
  contentType?: string;
}
```

#### SandboxAdapter

```ts
interface SandboxAdapter {
  /** Attach to or create a sandbox */
  attach(id: string): Promise<SandboxHandle>;
}
```

#### SandboxHandle

```ts
interface SandboxHandle {
  /** Execute a command and stream stdout */
  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array>;
  
  /** Upload files to the sandbox */
  upload(
    files: Array<{ path: string; content: Uint8Array | string }>,
    targetDir: string
  ): Promise<void>;
  
  /** Destroy the sandbox */
  destroy(): Promise<void>;
}
```

#### ExecOptions

```ts
interface ExecOptions {
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
}
```

---

## @bunny-agent/sandbox-sandock

Docker-based sandbox adapter.

### SandockSandbox

```ts
import { SandockSandbox } from "@bunny-agent/sandbox-sandock";
```

#### Constructor

```ts
new SandockSandbox(options?: SandockSandboxOptions)
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `options.image` | `string` | `"node:20-slim"` | Docker image |
| `options.volumePrefix` | `string` | `"/tmp/bunny-agent"` | Volume storage path |
| `options.networkEnabled` | `boolean` | `true` | Enable networking |
| `options.memoryLimit` | `string` | `"1g"` | Memory limit |
| `options.cpuLimit` | `number` | `2` | CPU limit |
| `options.timeout` | `number` | `30000` | Startup timeout (ms) |

**Example:**

```ts
const sandbox = new SandockSandbox({
  image: "python:3.11-slim",
  volumePrefix: "/var/bunny-agent/volumes",
  memoryLimit: "2g",
});
```

---

## @bunny-agent/sandbox-e2b

E2B cloud sandbox adapter.

### E2BSandbox

```ts
import { E2BSandbox } from "@bunny-agent/sandbox-e2b";
```

#### Constructor

```ts
new E2BSandbox(options?: E2BSandboxOptions)
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `options.apiKey` | `string` | `env.E2B_API_KEY` | E2B API key |
| `options.template` | `string` | `"base"` | Sandbox template |
| `options.timeout` | `number` | `60000` | Execution timeout (ms) |

**Example:**

```ts
const sandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY,
  template: "nodejs",
  timeout: 120000,
});
```

---

## @bunny-agent/sdk

Next.js and server-side helpers.

### createBunnyAgentHandler

Creates a Next.js API route handler.

```ts
import { createBunnyAgentHandler } from "@bunny-agent/sdk";
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options.sandbox` | `SandboxAdapter` | Sandbox adapter factory |
| `options.runner` | `RunnerSpec` | Default runner spec |
| `options.getSessionId` | `(req: Request) => string` | Session ID extractor |

**Example:**

```ts
import { createBunnyAgentHandler } from "@bunny-agent/sdk";
import { SandockSandbox } from "@bunny-agent/sandbox-sandock";

export const POST = createBunnyAgentHandler({
  sandbox: () => new SandockSandbox(),
  runner: {
    kind: "claude-agent-sdk",
    model: "claude-sonnet-4-20250514",
  },
  getSessionId: async (req) => {
    const { sessionId } = await req.json();
    return sessionId;
  },
});
```

---

## @bunny-agent/benchmark

GAIA benchmark runner for comparing agent CLIs.

### CLI Commands

```bash
# Download GAIA dataset
bunny-agent-benchmark download [--dataset validation|test]

# Run benchmark
bunny-agent-benchmark run --runner <runner> [options]

# Compare results
bunny-agent-benchmark compare
```

### Programmatic API

```ts
import {
  downloadGaiaDataset,
  runBenchmark,
} from "@bunny-agent/benchmark";

// Download dataset
const tasks = await downloadGaiaDataset("validation");

// Run benchmark
const results = await runBenchmark(tasks, "bunny-agent", {
  dataset: "validation",
  level: 1,
  outputDir: "./results",
  verbose: true,
});
```

---

## Error Handling

All async methods may throw errors. Handle them appropriately:

```ts
try {
  const response = await agent.stream({ messages });
  return response;
} catch (error) {
  if (error instanceof SandboxError) {
    // Sandbox-specific error
    console.error("Sandbox error:", error.message);
  } else if (error instanceof TimeoutError) {
    // Execution timeout
    console.error("Execution timed out");
  } else {
    // Unknown error
    throw error;
  }
}
```

---

## See Also

- [Quick Start](./QUICK_START.md)
- [Technical Specification](./TECHNICAL_SPEC.md)
- [Persistence Guide](./PERSISTENCE_GUIDE.md)
- [Sandbox Adapters](./SANDBOX_ADAPTERS.md)
