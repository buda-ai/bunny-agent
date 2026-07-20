# @bunny-agent/runner-opencode

OpenCode runner for Bunny Agent using ACP (Agent Client Protocol).

## Installation

```bash
npm install @bunny-agent/runner-opencode
```

## Prerequisites

- OpenCode CLI installed (`npm install -g opencode-ai`)
- OpenCode configured with your preferred model

## Usage

```typescript
import { createOpenCodeRunner } from '@bunny-agent/runner-opencode';

const runner = createOpenCodeRunner({
  model: 'claude-sonnet-4',
  cwd: '/path/to/workspace',
  env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "" },
  abortController: new AbortController(),
});

for await (const chunk of runner.run('Create a hello world script')) {
  process.stdout.write(chunk);
}
```

## Options

- `model` - Model to use (optional, uses OpenCode default)
- `cwd` - Working directory (default: `process.cwd()`)
- `env` - Environment overrides passed to the OpenCode process
- `abortController` - Optional signal-based cancellation
- `systemPrompt` - Instructions prepended to the first prompt
- `yolo` - Automatically approve ACP tool permission requests

## How it works

This runner spawns `opencode acp` and uses `@agentclientprotocol/sdk` 1.x over stdio. The shared ACP runtime converts session metadata, incremental text, reasoning, tool calls, usage, permissions, and errors to the Bunny Agent stream format.

## License

Apache-2.0
