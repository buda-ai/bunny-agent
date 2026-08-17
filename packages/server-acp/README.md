# @bunny-agent/server-acp

Serves any BunnyAgent runner (claude, pi, codex, gemini, opencode, copilot) as
an [Agent Client Protocol](https://agentclientprotocol.com) **agent**, so ACP
clients — Zed, JetBrains, and the Neovim/Emacs/VS Code plugins — can drive
BunnyAgent directly.

Note the direction: this package makes BunnyAgent *be* an ACP agent. The
existing `@bunny-agent/runner-acp` package does the opposite — it makes
BunnyAgent an ACP *client*, driving external ACP agents (`gemini-cli`,
`opencode`) as subprocesses.

## Layout

The core is transport-agnostic; pick the adapter for your transport.

| File | Role |
|---|---|
| `session-update-serializer.ts` | `RunnerChunk` → ACP `session/update` |
| `acp-agent.ts` | `initialize` / `session/new` / `session/prompt` / `session/cancel` |
| `http-server.ts` | Streamable HTTP adapter — used by `apps/daemon` |
| `stdio-server.ts` | stdio adapter — used by `apps/runner-cli`'s `acp` subcommand |

## Usage

### HTTP (daemon)

```ts
import { createAcpHttpServer } from "@bunny-agent/server-acp";

const server = createAcpHttpServer({ defaultRunner: "claude" });
// server.handleNodeHttp: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
// server.handleWebRequest: (req: Request) => Promise<Response>
```

### stdio (CLI / spawned by an editor)

```ts
import { runAcpOverStdio } from "@bunny-agent/server-acp";

await runAcpOverStdio({ defaultRunner: "claude", defaultModel: "claude-sonnet-4-20250514" });
// Long-lived — resolves when the connecting client disconnects.
```

## Runner/model selection

ACP's `session/new` has no runner/model field, so clients select one through
the protocol's implementation-defined `_meta` extension, namespaced under
`"bunny-agent"`:

```json
{
  "cwd": "/workspace",
  "mcpServers": [],
  "_meta": { "bunny-agent": { "runner": "pi", "model": "gemini-2.0-flash" } }
}
```

Omitted or malformed `_meta` falls back to `defaultRunner`/`defaultModel`.

## Scope

Tool permissions run under the server-side `yolo`/allowlist policy passed at
construction time — sessions don't yet forward interactive approvals to the
connected ACP client via `session/requestPermission`. See
[`docs/runner-maturity.md`](../../docs/runner-maturity.md#output-protocols)
for the full protocol comparison.
