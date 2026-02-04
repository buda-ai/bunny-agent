# @sandagent/sdk

Run Claude in a sandbox. Stream from your API, chat from React.

## Install

```bash
npm install @sandagent/sdk ai
npm install react react-dom
```

## Quick start

```typescript
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";
import { createUIMessageStream, createUIMessageStreamResponse, streamText } from "ai";

const sandbox = new LocalSandbox({ workdir: process.cwd() });
const sandagent = createSandAgent({ sandbox, cwd: sandbox.getWorkdir() });

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

## License

Apache-2.0
