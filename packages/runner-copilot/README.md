# @bunny-agent/runner-copilot

GitHub Copilot SDK runner for Bunny Agent.

## Prerequisites

- Node.js 20.19 or later
- A logged-in GitHub Copilot CLI user, or `GITHUB_TOKEN` / `GH_TOKEN`

The runner uses the SDK's default stdio transport. The optional `koffi` dependency is only needed for the SDK's experimental in-process transport.

## Usage

```typescript
import { createCopilotRunner } from "@bunny-agent/runner-copilot";

const runner = createCopilotRunner({
  model: "gpt-5",
  cwd: "/path/to/workspace",
  systemPrompt: "Follow the repository instructions.",
  yolo: true,
});

for await (const chunk of runner.run("Implement the requested change")) {
  process.stdout.write(chunk);
}
```

## Features

- New and resumed Copilot sessions
- Incremental text and reasoning output
- Tool call and token usage metadata
- Allowed-tool filtering and reasoning effort
- File-based approval bridge under `.bunny-agent/approvals/`
- `AbortController` cancellation and complete error streams

## License

Apache-2.0
