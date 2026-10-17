# Runner Integration Maturity

> Living document — update this whenever a runner gains/loses a capability,
> an SDK is upgraded, or a new runner lands. Last updated: 2026-10-16.

Architecture recap:

```
UI (useBunnyAgentChat) → /api/ai → SDK provider (packages/sdk, LanguageModelV3)
  → daemon (/api/coding/run) or CLI (bunny-agent run)
    → runner-harness (dispatchRunner) → runner-claude | runner-pi | runner-codex | runner-gemini | runner-opencode | runner-copilot

ACP client (Zed, JetBrains, ...) → daemon (/api/coding/acp) or CLI (bunny-agent acp, stdio)
  → server-acp (BunnyAgentAcpAgent) → runner-harness (dispatchRunner) → same runners
```

All runners speak the same wire protocol: SSE lines of AI SDK UI Data Stream
chunks (`start`, `message-metadata`, `text-start/delta/end`, `tool-*`,
`error`, `finish`, `data: [DONE]`). The SDK provider
(`packages/sdk/src/provider/bunny-agent-language-model.ts`) parses that stream,
so runner differences below describe **what each runner emits/supports**, not
different protocols.

## Output protocols

Runner output is served over two wire protocols, one package each. Both consume
the same `RunnerChunk` stream from `runner-harness`, so every runner is
available on both:

| Package | Protocol | Transports | Consumed by |
|---|---|---|---|
| `server-ai-sdk` | AI SDK UI Data Stream (SSE/NDJSON) | HTTP (`/api/coding/run`) | `packages/sdk`, Vercel AI SDK UI clients |
| `server-acp` | Agent Client Protocol (JSON-RPC) | HTTP (`/api/coding/acp`), stdio (`bunny-agent acp`) | ACP clients: Zed, JetBrains, Neovim/Emacs/VS Code plugins |

Note the direction: `server-acp` makes BunnyAgent *be* an ACP agent, whereas
`runner-acp` makes BunnyAgent an ACP *client* driving external ACP agents
(gemini-cli, opencode) as subprocesses.

ACP's `session/new` has no runner/model field, so clients select one through the
protocol's implementation-defined `_meta` extension, namespaced to avoid
colliding with other implementations:

```json
{ "cwd": "/workspace", "mcpServers": [],
  "_meta": { "bunny-agent": { "runner": "pi", "model": "..." } } }
```

Absent `_meta`, the server falls back to its configured default runner/model
(`--runner`/`--model` for the CLI, daemon config for HTTP).

## SDK versions

| Runner | Underlying SDK | Version |
|---|---|---|
| runner-claude | `@anthropic-ai/claude-agent-sdk` (in-process) | 0.3.215 |
| runner-pi | `@earendil-works/pi-coding-agent` / `pi-agent-core` / `pi-ai` | 1.2.0 |
| runner-codex | `@openai/codex-sdk` (official, in-process) | 0.144.6 |
| runner-gemini | `@agentclientprotocol/sdk` (Gemini CLI subprocess) | 1.2.1 |
| runner-opencode | `@agentclientprotocol/sdk` (OpenCode CLI subprocess) | 1.2.1 |
| runner-copilot | `@github/copilot-sdk` (Copilot CLI subprocess) | 1.0.7 |

## Capability matrix

Legend: ✅ supported · ⚠️ partial/caveat · ❌ not supported

| Capability | claude | pi | codex | gemini/opencode | copilot |
|---|---|---|---|---|---|
| systemPrompt | ✅ SDK option | ✅ via resource loader (`appendSystemPrompt`) | ⚠️ prepended on fresh threads | ⚠️ prepended to each ACP prompt | ✅ SDK system message |
| maxTurns | ✅ | ❌ no such concept | ❌ SDK has no option | ❌ | ❌ SDK has no option |
| allowedTools | ✅ (+ forced Skill/WebSearch/WebFetch) | ✅ filters built-in + custom + toolRefs | ❌ SDK has no option | ❌ ACP has no standard allowlist | ✅ SDK filter |
| resume | ✅ | ✅ (>10MB OOM guard + compaction fallback) | ✅ `resumeThread` | ⚠️ `session/load` when advertised, otherwise a new session | ✅ `resumeSession` |
| forkFrom | ✅ SDK `forkSession` | ✅ session snapshot-clone | ❌ | ❌ | ❌ |
| sessionId emission | ✅ from `system/init` | ✅ | ✅ from `thread.started` | ✅ from `session/new` or `session/load` | ✅ from SDK session |
| skills | ✅ harness paths mapped to a temporary plugin | ✅ `skillPaths` + resource loader | ❌ | ⚠️ agent CLI discovery only | ✅ Copilot config discovery |
| custom tools (toolRefs) | ✅ http/module runtimes through in-process MCP | ✅ http/module runtimes | ❌ (passes through MCP events) | ❌ | ❌ SDK supports tools, but Bunny `toolRefs` are not mapped |
| reasoning stream | ✅ | ❌ not converted | ✅ | ✅ ACP thought chunks | ✅ SDK reasoning deltas |
| incremental text streaming | ✅ | ✅ | ✅ | ✅ ACP message chunks | ✅ SDK message deltas |
| usage in finish metadata | ✅ | ✅ (+ per-tool usage) | ✅ | ✅ ACP prompt usage | ✅ accumulated SDK usage |
| effort / thinking level | ❌ | ✅ | ✅ minimal/low/medium/high/xhigh | ❌ | ✅ low/medium/high/xhigh |
| tool approval | ✅ file bridge | ✅ file bridge; bypass under `yolo`/root | ⚠️ SDK policy passthrough | ✅ file bridge / `yolo` | ✅ file bridge / `yolo` |
| abort handling | ✅ | ✅ | ✅ | ✅ process termination | ✅ `session.abort()` |
| stream-end error guard | ✅ | ✅ | ✅ | ✅ | ✅ |
| multimodal input (images) | ✅ | ✅ | ✅ base64 to temp file | ❌ | ❌ |
| auth | Anthropic key/token, Bedrock proxy, LiteLLM, Vertex | provider environment and custom endpoints | OpenAI/Codex key and base URL | agent CLI environment | logged-in Copilot user or GitHub token |
| mock fallback (no auth) | ✅ | ❌ | ❌ | ❌ | ❌ |
| env/systemEnv isolation | ❌ | ✅ | ❌ | ❌ | ❌ |

## Known gaps / next steps

- **claude**: `hooks` and the SDK's richer MCP server transports are not wired;
  Bunny tool refs use the in-process MCP transport.
- **pi**: no reasoning stream and no `maxTurns`.
  For `openai`-provider models, a native `apply_patch` tool (V4A context-diff
  format) is registered alongside the built-in read/write/edit/bash tools,
  since GPT-5.1/Codex-family models are trained to reach for `apply_patch`
  by default and otherwise fall back to invoking a nonexistent CLI via bash.
  `apply_patch` additionally exists as a real shell command in bash children:
  the runner prepends a PATH shim (`apply-patch-shim.ts`) execing the
  standalone `apply-patch-bin.js`, and sandbox images install it globally at
  `/usr/local/bin/apply_patch` — this covers heredoc invocations chained
  after other commands (`cd x && apply_patch <<'PATCH'`), which no tool
  registration can intercept. The V4A parsing/applying engine and CLI live in
  `packages/apply-patch` (`@bunny-agent/apply-patch`), a standalone package
  with no pi dependency — runner-pi wraps it as the native tool and the PATH
  shim, while `apps/runner-cli`/`apps/daemon` each bundle its CLI entry
  directly for their own sandbox binaries, without depending on runner-pi.
- **codex**: no `maxTurns`/`allowedTools` (SDK limitation); `systemPrompt` is
  emulation (prepended text), so it is not re-applied on `resume`; `file_change`
  items surface as an `apply_patch` tool call; `todo_list` items are dropped.
- **gemini/opencode**: ACP 1.x now provides typed streaming, session metadata,
  usage, reasoning, tool events, permissions, and complete error streams.
  Resume depends on the agent advertising `loadSession`; standard tool
  filtering is not available in ACP.
- **copilot**: `toolRefs`, image inputs, `forkFrom`, and `maxTurns` are not
  wired. The SDK's stdio transport is used; its experimental in-process FFI
  transport is intentionally not enabled.

## UI-layer compatibility

No per-runner UI work is needed: every runner emits the same AI SDK UI Data
Stream chunk vocabulary and the SDK provider normalizes them into
`LanguageModelV3StreamPart`s. Differences that do show up in the UI:

- `reasoning` parts from claude/codex/ACP/copilot are converted by the SDK
  provider into `reasoning-start/delta/end` V3 parts. The example UI renders
  them as a collapsible reasoning block.
- Gemini and OpenCode auto-resume when the ACP agent advertises `loadSession`.
  History replayed during `session/load` is not emitted as current-turn output.
- Tool call rendering is uniform (`dynamic-tool` parts); only tool *names*
  differ (`shell` vs `bash`, `server:tool` for MCP).

## Context compaction

The underlying agent SDKs compact automatically when their context windows
fill. Runners emit a shared compaction chunk when the SDK exposes lifecycle
events.

| Runner | auto-compaction | observable? | surfaced to UI |
|---|---|---|---|
| claude | ✅ SDK setting | ✅ status and compact-boundary events | ✅ |
| copilot | ✅ built-in | ✅ `session.compaction_start` / `session.compaction_complete` | ✅ |
| pi | ✅ built-in | ⚠️ extension API only | ❌ not yet |
| codex | ❓ not exposed by the SDK | ❌ | ❌ |

Observable runners emit
`{"type":"compaction","phase":"start"|"end",success?,trigger?,preTokens?,postTokens?,error?}`.
The SDK provider forwards this out of band through `onCompaction`; the web app
uses a transient `data-compaction` part so the event is not persisted as
assistant content.

## Web search / citation contract (`searchContractVersion: 1`)

Request-scoped, opt-in (never a process-global switch): omit
`searchContractVersion` for unchanged legacy behavior. Set it to `1` to
request the versioned retrieval/citation contract defined in
`packages/manager/src/contracts/` (re-exported browser-safe as
`@bunny-agent/sdk/contracts`). V1 requires stable `ai >=6.0.264 <7.0.0`
(packaged React hooks use `@ai-sdk/react ^3.0.267`); unsupported consumer
peers fail before execution. Legacy calls keep `ai: ^6.0.0` compatibility.
An explicit `1` selection that the runner/daemon
never acknowledges (older peer, or a stream that ends — including premature
EOF — before any acknowledgement arrives) fails closed: the SDK surfaces a
stream/generate error rather than silently falling back to legacy behavior or
retrying automatically.

See [`docs/search-citation-contract.md`](./search-citation-contract.md) for
the full protocol: retrieval/citation JSON shapes, Unicode code-point offset
units, source identity derivation, the explicit `[[cite:<source_id>]]`
marker bridge, native-annotation ingestion boundary, processing limits, and
Pi session resume/compaction/fork persistence — plus a validated illustrative
fixture at
[`docs/fixtures/search-citation-contract-handoff.json`](./fixtures/search-citation-contract-handoff.json).

| Runner | structured_retrieval | native_annotations | explicit_source_marker_annotations |
|---|---|---|---|
| pi | ✅ `details.web_search` structured success/failure envelope on native Brave/Tavily and recognized canonical tool-ref results | ❌ (Pi/pi-ai do not natively ingest Responses-shaped annotations) | ✅ assistant-authored `[[cite:<source_id>]]` markers resolved into `[n]` + Responses-shaped `url_citation` annotations |
| codex | ⚠️ query-only; Codex's own web-search tool is a provider-executed black box with no retrievable result payload — adapted to a truthful `source_details: "unavailable"` v1 envelope rather than inventing sources or zero-hit results | ❌ | ❌ (no bridge; Codex's SDK never surfaces assistant-visible search results to attach markers to) |
| claude, gemini, opencode, copilot | ❌ unsupported runner for this version | ❌ | ❌ |

Capabilities are never claimed speculatively: `native_annotations` is `false`
for every runner today because the installed Pi/Codex SDK versions do not
natively ingest or forward Responses-shaped annotations — this reflects the
currently installed dependency versions, not a Bunny-side limitation, and is
not expected to change without a dependency upgrade.

The harness (`runner-harness/src/runner.ts`) is the sole enforcement point: it
validates the requested version/runner pair before any runner is constructed,
and on acceptance prepends a `message-metadata` SSE chunk carrying the
runner's honest `SearchContractCapabilities` ahead of the runner's own stream.
The SDK provider (`bunny-agent-language-model.ts`) requires this
acknowledgement for any call that explicitly requested `searchContractVersion:
1`, and treats a missing or structurally malformed acknowledgement identically
(fail closed, no retry).

Downstream UIMessage consumers must pass `{ sendSources: true }` to
`toUIMessageStream()` to receive cited-source parts — the AI SDK does not
forward them by default.

## Tool approval semantics

Claude and Pi share a file-based approval bridge at
`.bunny-agent/approvals/<toolCallId>.json`.

- `AskUserQuestion` is always gated, including under `yolo`.
- Other Pi tools are gated unless `yolo` is enabled or the process runs as
  root, matching Claude's permission bypass behavior.
- Claude and Pi wait until the user answers or the run aborts. The web app
  still needs a generic approval UI for tools other than `AskUserQuestion`.
