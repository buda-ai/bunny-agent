# @sandagent/sandbox-sandock

Sandock sandbox adapter for SandAgent.

Run SandAgent inside a Sandock-hosted Docker sandbox (optionally using a prebuilt image for fast startup).

## Install

```bash
npm install @sandagent/sandbox-sandock @sandagent/manager
```

## Quickstart

Prereqs:
- Node.js 20+
- `SANDOCK_API_KEY`
- `ANTHROPIC_API_KEY` (or your runner credentials)

```ts
import { SandAgent } from "@sandagent/manager";
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const sandbox = new SandockSandbox({
  apiKey: process.env.SANDOCK_API_KEY,
  workdir: "/workspace",
  // Optional: use a prebuilt image that already contains runner + dependencies.
  image: "vikadata/sandagent:0.1.0",
  skipBootstrap: true,
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
  // Optional persistence (workspace + Claude session storage, etc.)
  // volumes: [
  //   { volumeName: "my-workspace", volumeMountPath: "/workspace" },
  //   { volumeName: "my-claude-session", volumeMountPath: "/root/.claude" },
  // ],
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
```

## Notes

- If `skipBootstrap` is `true`, the adapter uses `sandagent run` from the image.
- If `skipBootstrap` is `false`, the adapter installs `@sandagent/runner-cli@beta` into the sandbox `workdir` on attach, then uses `${workdir}/node_modules/.bin/sandagent`.

## License

Apache-2.0
