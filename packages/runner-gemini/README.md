# @bunny-agent/runner-gemini

Gemini CLI runner for Bunny Agent using ACP (Agent Client Protocol).

## Installation

```bash
npm install @bunny-agent/runner-gemini
```

## Prerequisites

- Gemini CLI installed (`npm install -g @google/gemini-cli`)
- Gemini configured with your API key

## Usage

```typescript
import { createGeminiRunner } from '@bunny-agent/runner-gemini';

const runner = createGeminiRunner({
  model: 'gemini-2.0-flash-exp',
  cwd: '/path/to/workspace',
  env: { GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "" },
  abortController: new AbortController(),
});

for await (const chunk of runner.run('Create a hello world script')) {
  process.stdout.write(chunk);
}
```

## Options

- `model` - Model to use (optional, uses Gemini default)
- `cwd` - Working directory (default: `process.cwd()`)
- `env` - Environment overrides passed to the Gemini process
- `abortController` - Optional signal-based cancellation
- `systemPrompt` - Instructions prepended to the first prompt
- `yolo` - Automatically approve ACP tool permission requests

## How it works

This runner spawns `gemini --experimental-acp` and uses `@agentclientprotocol/sdk` 1.x over stdio. The shared ACP runtime converts session metadata, incremental text, reasoning, tool calls, usage, permissions, and errors to the Bunny Agent stream format.

## License

Apache-2.0
