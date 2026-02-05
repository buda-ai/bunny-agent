# @sandagent/runner-claude

A Claude Agent SDK runtime that converts Claude output into AI SDK UI streams (SSE/NDJSON) for SandAgent.

> Note: this is a monorepo internal runtime (`"private": true`) and is not published to npm. Use it via workspace.

## When do you need it?

- You’re building your own runner/CLI and need to convert Claude Agent SDK messages into AI SDK UI Data Stream.
- You’re developing `@sandagent/runner-cli` / `@sandagent/manager-cli` in this repo and want a reusable Claude runner.

## Quick start (beginner-friendly)

Prereqs: Node.js >= 20, `pnpm`, and `ANTHROPIC_API_KEY` (or Bedrock credentials).

```bash
# 1) Install deps (from monorepo root)
pnpm install
```

Minimal example (write the stream to stdout):

```ts
import { createClaudeRunner } from "@sandagent/runner-claude";

const runner = createClaudeRunner({
  model: "claude-3-5-sonnet-20241022",
  outputFormat: "stream",
  cwd: process.cwd(),
});

for await (const chunk of runner.run("Write a TypeScript hello world")) {
  process.stdout.write(chunk);
}
```

## Environment variables

- `ANTHROPIC_API_KEY`: required for Anthropic direct
- `AWS_BEARER_TOKEN_BEDROCK`: for Bedrock (depending on your SDK setup)

## API (most common)

- `createClaudeRunner(options)`: create a runner (`model` is required)
- `runner.run(userInput)`: returns `AsyncIterable<string>` (AI SDK UI stream)

## License

Apache 2.0
