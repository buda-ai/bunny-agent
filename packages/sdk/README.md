# @sandagent/sdk

SandAgent SDK - AI Provider and React hooks for building AI agents with sandboxed execution.

## Installation

```bash
pnpm install @sandagent/sdk ai
```

For React applications:

```bash
npm install @sandagent/sdk ai react react-dom
```

## Quick Start

### Backend

```typescript
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";
import { streamText, createUIMessageStream, createUIMessageStreamResponse } from "ai";

const sandbox = new LocalSandbox({
  workdir: process.cwd(),
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
});

const sandagent = createSandAgent({ sandbox });

// Use with AI SDK
const result = streamText({
  model: sandagent("sonnet"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Frontend

```tsx
import { useSandAgentChat } from "@sandagent/sdk/react";

export default function ChatPage() {
  const { messages, sendMessage, isLoading } = useSandAgentChat({
    apiEndpoint: "/api/ai",
  });

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>{/* render message */}</div>
      ))}
      <button onClick={() => sendMessage("Hello!")}>Send</button>
    </div>
  );
}
```

## Environment Variables

Set up your API key:

**Anthropic API (Recommended):**
```bash
ANTHROPIC_API_KEY=sk-ant-xxx
```

**AWS Bedrock:**
```bash
AWS_BEARER_TOKEN_BEDROCK=xxx
```

## Features

- **AI Provider**: Use SandAgent as an AI SDK provider
- **React Hooks**: `useSandAgentChat` for chat interfaces
- **Artifacts**: Automatically extract and display AI-generated files
- **Custom Sandboxes**: Works with E2B, Sandock, Daytona, and Local sandboxes

## API Reference

### Backend Exports

```typescript
import {
  createSandAgent,        // Create SandAgent provider
  LocalSandbox,            // Local sandbox adapter
  SandAgentLanguageModel,  // Language model class
  resolveModelId,          // Resolve model ID alias
} from "@sandagent/sdk";
```

### Frontend Exports

```typescript
import {
  useSandAgentChat,      // Main chat hook
  useArtifacts,          // Artifacts management hook
  useAskUserQuestion,    // User question UI hook
  useWriteTool,          // Write tool UI hook
} from "@sandagent/sdk/react";
```

## Usage

### Artifacts

```tsx
const { artifacts, selectedArtifact, setSelectedArtifact } = useSandAgentChat({
  apiEndpoint: "/api/ai",
});
```

### Custom Agent Templates

Create a template directory with `CLAUDE.md` and skills:

```
my-agent-template/
├── CLAUDE.md
└── .claude/
    └── skills/
        └── my-skill/
            └── SKILL.md
```

Pass the template path to `LocalSandbox`:

```typescript
const sandbox = new LocalSandbox({
  workdir: process.cwd(),
  templatesPath: "./my-agent-template",
  env: { ANTHROPIC_API_KEY },
});
```

All files (including `CLAUDE.md` and `.claude/skills/`) will be automatically copied to the workspace.

## License

Apache-2.0
