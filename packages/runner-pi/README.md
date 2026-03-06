# @sandagent/runner-pi

Pi agent runner for SandAgent.

## Installation

```bash
npm install @sandagent/runner-pi
```

## Usage

```ts
import { createPiRunner } from "@sandagent/runner-pi";

const runner = createPiRunner({
  model: "google:gemini-2.5-pro",
  cwd: process.cwd(),
});

for await (const chunk of runner.run("Create a hello world script")) {
  process.stdout.write(chunk);
}
```

## Options

- `model`: model id in `<provider>:<model>` format, for example `google:gemini-2.5-pro`
- `systemPrompt`: custom system prompt
- `cwd`: working directory for coding tools
- `env`: environment overrides (used for runtime configuration such as base URLs)
- `abortController`: signal-driven cancellation

## Output

Produces AI SDK UI data stream (SSE) chunks.
