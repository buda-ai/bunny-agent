# @bunny-agent/sandbox-daytona

Daytona sandbox adapter for Bunny Agent.

Run Bunny Agent inside a Daytona workspace, with optional volume persistence and snapshot-based fast boot.

## Install

```bash
npm install @bunny-agent/sandbox-daytona @bunny-agent/manager
```

## Quickstart

Prereqs:
- Node.js 20+
- `DAYTONA_API_KEY` (and optionally `DAYTONA_API_URL`)
- `ANTHROPIC_API_KEY` (or your runner credentials)

```ts
import { Bunny Agent } from "@bunny-agent/manager";
import { DaytonaSandbox } from "@bunny-agent/sandbox-daytona";

const sandbox = new DaytonaSandbox({
  apiKey: process.env.DAYTONA_API_KEY,
  name: "my-bunny-agent-sandbox", // enables reuse by name
  volumeName: "my-bunny-agent-volume", // optional persistence
  workdir: "/workspace",
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
  // Optional: use a prebuilt snapshot so the sandbox already has dependencies.
  // snapshot: "bunny-agent-claude:0.1.0",
});

const agent = new BunnyAgent({
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
- The adapter installs `@bunny-agent/runner-cli@latest` inside the sandbox `workdir` on first attach (unless you provide `snapshot`).
- If you set `snapshot`, `getRunnerCommand()` uses `bunny-agent run` from the snapshot; otherwise it uses `${workdir}/node_modules/.bin/bunny-agent`.

## License

Apache-2.0
