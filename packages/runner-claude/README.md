# @bunny-agent/runner-claude

A Claude Agent SDK runtime that converts Claude output into AI SDK UI streams (SSE/NDJSON) for Bunny Agent.

> Note: this is a monorepo internal runtime (`"private": true`) and is not published to npm. Use it via workspace.

## External Tool Output

External `toolRefs` responses use Bunny's shared output protection: text is
limited to 50 KiB or 2,000 lines, including the truncation notice. Successful
responses, error response bodies, and transport exceptions are covered.

Oversized responses are saved verbatim in private files under
`cwd/.bunny/tool-output/`. The preview includes an absolute path and guidance
to read a bounded fragment using the runner's file or shell tools. Small
responses retain their existing behavior. Saving failures produce an explicit
notice while keeping the preview bounded.

Output files persist across session resume and can be removed when no longer
needed. The guard limits individual returned text responses; it does not rewrite
existing history, bound aggregate tool batches, or cap HTTP download memory.
Direct users can pass `{ cwd }` as the second argument to
`buildMcpToolDefinitionsFromRefs`; otherwise the process working directory is used.

## When do you need it?

- You’re building your own runner/CLI and need to convert Claude Agent SDK messages into AI SDK UI Data Stream.
- You’re developing `@bunny-agent/runner-cli` / `@bunny-agent/manager-cli` in this repo and want a reusable Claude runner.

## Quick start (beginner-friendly)

Prereqs: Node.js >= 20, `pnpm`, and `ANTHROPIC_API_KEY` (or Bedrock credentials).

```bash
# 1) Install deps (from monorepo root)
pnpm install
```

Minimal example (write the stream to stdout):

```ts
import { createClaudeRunner } from "@bunny-agent/runner-claude";

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
