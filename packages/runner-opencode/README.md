# @sandagent/runner-opencode

OpenCode runner for SandAgent using ACP (Agent Client Protocol).

## Installation

```bash
npm install @sandagent/runner-opencode
```

## Prerequisites

- OpenCode CLI installed (`npm install -g opencode-ai`)
- OpenCode configured with your preferred model

## Usage

```typescript
import { createOpenCodeRunner } from '@sandagent/runner-opencode';

const runner = createOpenCodeRunner({
  model: 'claude-sonnet-4',
  cwd: '/path/to/workspace',
  sessionKey: 'my-session',
});

for await (const chunk of runner.run('Create a hello world script')) {
  process.stdout.write(chunk);
}
```

## Options

- `model` - Model to use (optional, uses OpenCode default)
- `cwd` - Working directory (default: `process.cwd()`)
- `sessionKey` - Session key for persistence (optional)

## How it works

This runner spawns the `opencode acp` command and communicates via ACP protocol over stdio. It converts ACP messages to AI SDK UI format for compatibility with SandAgent.

## License

Apache-2.0
