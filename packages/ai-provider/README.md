# @sandagent/ai-provider

AI SDK provider for SandAgent - run Claude Agent SDK in isolated sandboxes.

This package provides a `LanguageModelV3` implementation that runs Claude Agent SDK inside sandboxed environments (E2B, Sandock, Daytona, etc.), enabling secure agentic AI workloads with file system access, code execution, and more.

## Installation

```bash
npm install @sandagent/ai-provider ai
# Also install a sandbox adapter:
npm install @sandagent/sandbox-e2b  # or sandbox-sandock, sandbox-daytona
```

## Quick Start

```typescript
import { createSandAgent } from '@sandagent/ai-provider';
import { E2BSandbox } from '@sandagent/sandbox-e2b';
import { generateText, streamText } from 'ai';

// Create the provider with a sandbox adapter
const sandagent = createSandAgent({
  sandbox: new E2BSandbox({
    apiKey: process.env.E2B_API_KEY!,
    template: 'base', // or your custom template
  }),
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});

// Use with AI SDK's generateText
const { text } = await generateText({
  model: sandagent('sonnet'),
  prompt: 'Create a React component that displays a todo list',
});

console.log(text);

// Streaming works too
const { textStream } = await streamText({
  model: sandagent('sonnet', { template: 'coder' }),
  prompt: 'Build a REST API server with Express',
});

for await (const chunk of textStream) {
  process.stdout.write(chunk);
}
```

## Supported Models

The provider supports all Claude models that the underlying Claude Agent SDK supports:

| Alias | Model ID |
|-------|----------|
| `sonnet` | `claude-sonnet-4-20250514` |
| `opus` | `claude-opus-4-20250514` |
| `haiku` | `claude-3-5-haiku-20241022` |

You can also use full model IDs directly:

```typescript
sandagent('claude-3-5-sonnet-20241022')
sandagent('claude-3-opus-20240229')
```

## Configuration

### Provider Settings

```typescript
const sandagent = createSandAgent({
  // Required: Sandbox adapter
  sandbox: new E2BSandbox({ apiKey: 'xxx' }),

  // Required: Environment variables for the sandbox
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    // Add any other env vars your code needs
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  },

  // Optional: Agent template (default, coder, analyst, researcher)
  template: 'coder',

  // Optional: Custom system prompt (overrides template)
  systemPrompt: 'You are a helpful coding assistant...',

  // Optional: Maximum conversation turns
  maxTurns: 20,

  // Optional: Allowed tools (undefined = all tools)
  allowedTools: ['Read', 'Write', 'Bash(git:*)'],

  // Optional: Working directory in sandbox
  cwd: '/workspace',

  // Optional: Session ID for resuming conversations
  sessionId: 'my-session-123',

  // Optional: Enable verbose logging
  verbose: true,
});
```

### Per-Request Settings

You can override settings for individual requests:

```typescript
const { text } = await generateText({
  model: sandagent('sonnet', {
    template: 'analyst',
    maxTurns: 5,
  }),
  prompt: 'Analyze this data...',
});
```

## Sandbox Adapters

SandAgent supports multiple sandbox providers:

### E2B Sandbox

```typescript
import { E2BSandbox } from '@sandagent/sandbox-e2b';

const sandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY!,
  template: 'base', // E2B template ID
  timeout: 60 * 60 * 1000, // 1 hour
});
```

### Sandock (Docker-based)

```typescript
import { SandockSandbox } from '@sandagent/sandbox-sandock';

const sandbox = new SandockSandbox({
  image: 'node:20',
  // ... docker options
});
```

### Daytona

```typescript
import { DaytonaSandbox } from '@sandagent/sandbox-daytona';

const sandbox = new DaytonaSandbox({
  // ... daytona options
});
```

## Features

### Multi-Turn Conversations

The provider automatically tracks session IDs for multi-turn conversations:

```typescript
const model = sandagent('sonnet');

// First turn
const result1 = await generateText({
  model,
  prompt: 'Create a file called hello.txt with "Hello World"',
});

// Get the session ID from providerMetadata
const sessionId = result1.experimental_providerMetadata?.sandagent?.sessionId;

// Resume the conversation
const { text } = await generateText({
  model: sandagent('sonnet', { resume: sessionId }),
  prompt: 'Now read the file and tell me what it contains',
});
```

### Tool Execution

The agent can execute tools inside the sandbox:

- File operations (Read, Write, Edit, LS)
- Command execution (Bash)
- Search (Grep, Glob)
- And more from Claude Agent SDK

### Transcript Logging

```typescript
import { JsonlTranscriptWriter } from '@sandagent/core';

const transcriptWriter = new JsonlTranscriptWriter('./transcript.jsonl');

const { text } = await generateText({
  model: sandagent('sonnet', { transcriptWriter }),
  prompt: 'Do something complex...',
});
```

## API Reference

### `createSandAgent(settings)`

Creates a SandAgent provider instance.

**Parameters:**
- `settings.sandbox` (required): A SandboxAdapter instance
- `settings.env`: Environment variables to pass to the sandbox
- `settings.template`: Agent template name
- `settings.systemPrompt`: Custom system prompt
- `settings.maxTurns`: Maximum conversation turns
- `settings.allowedTools`: List of allowed tools
- `settings.cwd`: Working directory
- `settings.sessionId`: Session ID for resuming
- `settings.resume`: Resume session ID
- `settings.verbose`: Enable verbose logging
- `settings.logger`: Custom logger or `false` to disable

**Returns:** A `SandAgentProvider` instance that can be used with AI SDK.

### `SandAgentLanguageModel`

The language model class that implements `LanguageModelV3`. Usually you don't need to instantiate this directly - use `createSandAgent()` instead.

## Requirements

- Node.js 18+
- AI SDK 4.0+
- A sandbox adapter (@sandagent/sandbox-e2b, etc.)
- Anthropic API key

## License

Apache-2.0
