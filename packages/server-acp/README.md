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

## Process information

Stable ACP v1 notifications preserve text, reasoning, plans, tool status,
structured tool content (including diffs and images), affected locations,
resource links, and provider metadata. Known tools receive display categories
and readable titles while their original input/output remain available.
`TodoWrite`, `update_plan`, and modern Claude task tools produce full `plan`
snapshots. No plan or step count is inferred from an unstructured response.

Native ACP runners retain original notifications on an internal
`data-acp-session-update` channel alongside AI SDK compatibility chunks. The
ACP serializer forwards the original exactly once; the AI SDK provider ignores
the internal channel. This avoids a lossy ACP-to-text-to-ACP round trip.

To receive lifecycle events, explicitly advertise this extension:

```json
{ "clientCapabilities": { "_meta": { "bunny-agent": { "eventStream": 1 } } } }
```

The server then emits `_bunny-agent/session_event` notifications with
`{ sessionId, event: { version: 1, type, turnId, at, ... } }`. Event types are
`turn_started`, `step_started`, `step_finished`, `turn_finished`,
`resource_update`, and `job_update`. Steps use real provider boundaries. The
terminal event carries the stop reason and reported usage; unknown consumption
is not presented as zero or as context-window occupancy. Clients that do not
negotiate this extension receive standard ACP notifications only.

## User interaction

The `initialize` response advertises capabilities under `_meta["bunny-agent"]`.
`interactiveRunners` lists Claude, Pi, Copilot, Gemini, and OpenCode: these have
a real pre-execution host gate. `session/new` reports support for the selected
runner. The current Codex SDK exposes no such callback, so Codex does not claim
interactive authorization support.

Non-YOLO tools use `session/request_permission`. A rejection reaches the gate
before tool execution. Claude/Pi questions and Copilot user-input callbacks
use `elicitation/create` form mode only when the client advertises
`elicitation.form: {}`. Form support remains experimental in the pinned SDK
and is locked by protocol tests. Questions do not grant tool authorization.
Unsupported clients receive an explicit tool failure rather than an
unanswerable question.

Interactive requests carry `_meta["bunny-agent"].interactionId`. A replacement
host worker can deliver a decision over another connection on the same daemon:

```json
{
  "method": "_bunny-agent/interaction/respond",
  "params": {
    "sessionId": "original-session",
    "requestId": "interaction-id",
    "action": "accept",
    "optionId": "allow-once"
  }
}
```

For permissions, `action: "accept"` confirms selection of an offered option;
the option's `kind` determines whether execution is allowed or rejected.
Form replies use `content` instead of `optionId`. Both session and unguessable
interaction identity must match. Identical retries acknowledge the original
decision; conflicting decisions and invalid answers fail. `{ "ok": true }`
confirms that the waiting runner gate consumed the decision, not that the tool
completed. Cancellation or daemon restart cannot silently replay an approval.

## Building the executing runtime

This package is bundled into the daemon and runner CLI. Updating the SDK alone
does not update a remote sandbox daemon:

```bash
pnpm -r --filter @bunny-agent/daemon... build
# apps/daemon/dist/bundle.mjs -> HTTP /api/coding/acp
pnpm -r --filter @bunny-agent/runner-cli... build
# apps/runner-cli/dist/bundle.mjs acp -> stdio
```

Input remains baseline text plus structured inline images. Generic documents
and audio must first use a supported host materialization/processing path.
See [`docs/runner-maturity.md`](../../docs/runner-maturity.md#output-protocols)
for runner-specific limitations.

## Source-backed development acceptance

`scripts/acp-fidelity-model.mjs` provides a loopback OpenAI-compatible model
endpoint. Only the model response is scripted: the compiled daemon still uses
the real runner harness, Pi sessions, actual read/write/edit/bash tools,
permission callbacks, structured input, and ACP serialization.

```bash
BUNNY_ACP_MODEL_PORT=33918 node scripts/acp-fidelity-model.mjs
BUNNY_AGENT_DAEMON_HOST=127.0.0.1 BUNNY_AGENT_DAEMON_PORT=33917 \
  BUNNY_AGENT_ROOT=/tmp/bunny-acp-acceptance \
  PI_CODING_AGENT_DIR=/tmp/bunny-acp-acceptance/pi \
  node apps/daemon/dist/bundle.mjs
```

Create an ACP session with runner `pi`, model `openai:fake-model`, and scoped
runner env `OPENAI_API_KEY=fixture` plus
`OPENAI_BASE_URL=http://127.0.0.1:33918/v1`. The unknown model uses Pi's actual
dynamic OpenAI chat-completions provider registration. The host may point its
normal `SANDAGENT_DAEMON_URL` at this daemon.

The default `full` story writes, reads, and edits `report.md`, asks single-choice,
multiple-choice and free-text questions, executes a harmless shell command,
and returns a Buda send-file marker. If a real `update_plan`/`TodoWrite` tool
is present, the model also calls it before and after the work; it never emits
a fabricated ACP plan. An optional HTTP tool ref may target
`http://127.0.0.1:33918/tool/update_plan` with `{ plan: [{ step, status }] }`.

Use `POST /control/scenario` with `{ "scenario": "full", "marker": "ACK",
"clearRequests": true }` to reset the story. Other scenarios are `plain`,
`reject`, `question`, and `cancel`. `GET /requests` exposes the local model and
HTTP tool receipts for assertions. Missing required real tools produce an
explicit message. Keep this fixture bound to loopback and use an isolated
working directory; it is a development harness, not a production model.
