# @sandagent/runner-gemini

Gemini CLI runner for SandAgent using ACP (Agent Client Protocol).

## Installation

```bash
npm install @sandagent/runner-gemini
```

## Prerequisites

- Gemini CLI installed (`npm install -g @google/generative-ai-cli`)
- Gemini configured with your API key

## Usage

```typescript
import { createGeminiRunner } from '@sandagent/runner-gemini';

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

## How it works

This runner spawns the `gemini --experimental-acp` command and communicates via ACP protocol over stdio. It converts ACP messages to AI SDK UI format for compatibility with SandAgent.

## License

Apache-2.0
