# @sandagent/sandbox-daytona

Daytona sandbox adapter for SandAgent.

Run SandAgent inside a Daytona workspace, with optional volume persistence and snapshot-based fast boot.

## Install

```bash
npm install @sandagent/sandbox-daytona @sandagent/manager
```

## Quickstart

Prereqs:
- Node.js 20+
- `DAYTONA_API_KEY` (and optionally `DAYTONA_API_URL`)
- `ANTHROPIC_API_KEY` (or your runner credentials)

```ts
import { SandAgent } from "@sandagent/manager";
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";

const sandbox = new DaytonaSandbox({
  apiKey: process.env.DAYTONA_API_KEY,
  name: "my-sandagent-sandbox", // enables reuse by name
  volumeName: "my-sandagent-volume", // optional persistence
  workdir: "/workspace",
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
  // Optional: use a prebuilt snapshot so the sandbox already has dependencies.
  // snapshot: "sandagent-claude:0.1.0",
});

const agent = new SandAgent({
  sandbox,
  runner: {
    kind: "claude-agent-sdk",
    model: "claude-sonnet-4-20250514",
    outputFormat: "stream",
  },
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});

const stream = await agent.stream({
  messages: [{ role: "user", content: "Create a hello world program" }],
  workspace: { path: "/workspace" },
});

// Consume the AI SDK UI stream
const reader = stream.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(value);
}

await agent.destroy();
```

## Notes

- If you set `name`, the adapter will try to reuse an existing sandbox with that name.
- If you set `volumeName`, the adapter creates/attaches a persistent volume.
- The adapter installs `@sandagent/runner-cli@latest` inside the sandbox `workdir` on first attach (unless you provide `snapshot`).
- If you set `snapshot`, `getRunnerCommand()` uses `sandagent run` from the snapshot; otherwise it uses `${workdir}/node_modules/.bin/sandagent`.

## License

Apache-2.0
