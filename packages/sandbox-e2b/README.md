# @bunny-agent/sandbox-e2b

E2B sandbox adapter for Bunny Agent - run agents in secure cloud sandboxes.

Use E2B as the execution environment for Bunny Agent (isolated cloud sandbox with optional persistence and reuse).

## Overview

`@bunny-agent/sandbox-e2b` provides an E2B-based sandbox implementation for Bunny Agent. E2B offers secure, isolated cloud environments with:

- Fast startup times
- Persistent storage (up to 30 days when paused)
- Sandbox reuse by name
- Support for custom templates

## Installation

```bash
npm install @bunny-agent/sandbox-e2b @bunny-agent/sdk
```

You'll also need an E2B API key. Sign up at [e2b.dev](https://e2b.dev) to get one.

## Quick Start

```typescript
import { E2BSandbox } from '@bunny-agent/sandbox-e2b';
import { Bunny Agent } from '@bunny-agent/manager';

// Create sandbox adapter
// Runner is automatically downloaded from npm if runnerBundlePath is not provided
const sandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY!,
  template: 'base', // E2B template ID
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});

// Use with Bunny Agent
const agent = new BunnyAgent({
  sandbox,
  runner: {
    kind: 'claude-agent-sdk',
    model: 'claude-sonnet-4-20250514',
    outputFormat: 'stream',
  },
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});

const stream = await agent.stream({
  messages: [{ role: 'user', content: 'Hello!' }],
  workspace: { path: '/workspace' },
});
```

## Usage with AI Provider

```typescript
import { createBunnyAgent } from '@bunny-agent/sdk';
import { E2BSandbox } from '@bunny-agent/sandbox-e2b';
import { generateText } from 'ai';

// Runner is automatically downloaded from npm
const bunnyAgent = createBunnyAgent({
  sandbox: new E2BSandbox({
    apiKey: process.env.E2B_API_KEY!,
  }),
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});

const { text } = await generateText({
  model: bunnyAgent('sonnet'),
  prompt: 'Create a hello world program',
});
```

## Configuration Options

### E2BSandboxOptions

```typescript
interface E2BSandboxOptions {
  // Required: E2B API key (or set E2B_API_KEY env var)
  apiKey?: string;
  
  // E2B template to use (default: "base")
  template?: string;
  
  // Sandbox timeout in seconds (default: 3600 = 1 hour)
  // Hobby tier: max 1 hour, Pro tier: max 24 hours
  timeout?: number;
  
  // Path to runner bundle.mjs (optional)
  // If not provided, automatically downloads @bunny-agent/runner-cli from npm
  runnerBundlePath?: string;
  
  // Path to template directory to upload
  templatesPath?: string;
  
  // Sandbox name for reuse (optional)
  // If provided, will try to find existing sandbox by name
  name?: string;
  
  // Environment variables for the sandbox
  env?: Record<string, string>;
  
  // Agent template (default, coder, analyst, researcher)
  agentTemplate?: string;
  
  // Working directory inside sandbox (default: '/workspace')
  workdir?: string;
}
```

## Sandbox Reuse

E2B supports sandbox persistence and reuse:

```typescript
const sandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY!,
  name: 'my-project-sandbox', // Unique name for this sandbox
  // runnerBundlePath is optional - runner is auto-downloaded from npm
});

// First call: creates new sandbox
await sandbox.attach();

// Later calls: reuses existing sandbox by name
await sandbox.attach();
```

**E2B Limitations (Beta):**
- Sandbox can be paused for up to 30 days
- Continuous runtime limits:
  - Hobby tier: max 1 hour
  - Pro tier: max 24 hours
- See: https://e2b.dev/docs/sandbox/persistence

## Advanced Usage

### Custom Templates

Upload your own templates to the sandbox:

```typescript
const sandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY!,
  // runnerBundlePath is optional - runner is auto-downloaded from npm
  templatesPath: './templates/coder', // Upload custom template files
  agentTemplate: 'coder',
});
```

### Multiple Sandboxes

```typescript
// Development sandbox
const devSandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY!,
  name: 'dev-sandbox',
});

// Production sandbox
const prodSandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY!,
  name: 'prod-sandbox',
  timeout: 86400, // 24 hours (Pro tier)
});
```

## Environment Variables

The sandbox accepts environment variables that will be available to all commands:

```typescript
const sandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY!,
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    DATABASE_URL: process.env.DATABASE_URL,
  },
});
```

## Requirements

- Node.js 20+
- E2B API key (get one at [e2b.dev](https://e2b.dev))
- `@bunny-agent/manager` package

**Note:** `@bunny-agent/runner-cli` is automatically downloaded from npm when the sandbox initializes. You don't need to install it locally unless you want to use a custom bundle.

## API Reference

### E2BSandbox

Implements the `SandboxAdapter` interface from `@bunny-agent/manager`.

#### Methods

**attach(): Promise<SandboxHandle>**

Attaches to an E2B sandbox. If a name is provided and a sandbox with that name exists, connects to it. Otherwise, creates a new sandbox.

**getHandle(): SandboxHandle | null**

Returns the current sandbox handle if attached, null otherwise.

**getEnv(): Record<string, string>**

Returns the environment variables configured for this sandbox.

**getAgentTemplate(): string**

Returns the agent template name.

**getWorkdir(): string**

Returns the working directory path.

## License

Apache-2.0
