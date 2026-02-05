# @sandagent/sdk

Run Claude in a sandbox. Stream from your API, chat from React.

`@sandagent/sdk` is the easiest way to run an agent in a sandbox (local or cloud) and expose it as an AI SDK-compatible model, with optional React chat hooks for your UI.

## What you get

- A provider (`createSandAgent`) that you can pass to AI SDK APIs (e.g. `streamText`, `generateText`)
- A built-in `LocalSandbox` for local development
- React hooks under `@sandagent/sdk/react` for building chat UIs

## Install

```bash
npm install @sandagent/sdk ai
npm install react react-dom
```

## Quickstart

Typical setup:
1) **Server**: create a sandbox + provider and stream AI SDK UI messages.
2) **Client**: call your API route with the React hook.

```typescript
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";

const sandbox = new LocalSandbox({
  workdir: process.cwd(),
});

const sandagent = createSandAgent({
  sandbox,
  cwd: sandbox.getWorkdir(),
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});

const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    const result = streamText({
      model: sandagent("sonnet"),
      messages,
      abortSignal: request.signal,
    });
    writer.merge(result.toUIMessageStream());
  },
});
return createUIMessageStreamResponse({ stream });
```

```tsx
import { useSandAgentChat } from "@sandagent/sdk/react";

const { messages, sendMessage } = useSandAgentChat({ apiEndpoint: "/api/ai" });
```

## Using cloud sandboxes

- `LocalSandbox` (bundled): run on your machine (good for quickstarts/dev)
- Cloud adapters (separate packages): `@sandagent/sandbox-e2b`, `@sandagent/sandbox-daytona`, `@sandagent/sandbox-sandock`

## License

Apache-2.0
