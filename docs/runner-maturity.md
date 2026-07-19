# Runner Integration Maturity

> Living document — update this whenever a runner gains/loses a capability,
> an SDK is upgraded, or a new runner lands. Last updated: 2026-07-19.

Architecture recap:

```
UI (useBunnyAgentChat) → /api/ai → SDK provider (packages/sdk, LanguageModelV3)
  → daemon (/api/coding/run) or CLI (bunny-agent run)
    → runner-harness (dispatchRunner) → runner-claude | runner-pi | runner-codex | runner-copilot | runner-gemini | runner-opencode
```

All runners speak the same wire protocol: SSE lines of AI SDK UI Data Stream
chunks (`start`, `message-metadata`, `text-start/delta/end`, `tool-*`,
`error`, `finish`, `data: [DONE]`). The SDK provider
(`packages/sdk/src/provider/bunny-agent-language-model.ts`) parses that stream,
so runner differences below describe **what each runner emits/supports**, not
different protocols.

## SDK versions

| Runner | Underlying SDK | Version |
|---|---|---|
| runner-claude | `@anthropic-ai/claude-agent-sdk` (in-process) | 0.3.211 |
| runner-pi | `@earendil-works/pi-coding-agent` / `pi-agent-core` / `pi-ai` | 0.80.7 |
| runner-codex | `@openai/codex-sdk` (official, in-process) | 0.144.5 |
| runner-copilot | `@github/copilot-sdk` (JSON-RPC to Copilot CLI) | 1.0.7 |
| runner-gemini | ACP subprocess wrapper | — |
| runner-opencode | ACP subprocess wrapper | — |

## Capability matrix

Legend: ✅ supported · ⚠️ partial/caveat · ❌ not supported

| Capability | claude | pi | codex | gemini/opencode |
|---|---|---|---|---|
| systemPrompt | ✅ SDK option | ✅ via resource loader (`appendSystemPrompt`) | ⚠️ emulated: prepended to first input on fresh threads | ❌ |
| maxTurns | ✅ | ❌ no such concept | ❌ SDK has no option | ❌ |
| allowedTools | ✅ (+ forced Skill/WebSearch/WebFetch) | ✅ filters built-in + custom + toolRefs | ❌ SDK has no option | ❌ |
| resume | ✅ | ✅ (with >10MB session OOM guard + compaction fallback) | ✅ `resumeThread` | ❌ |
| forkFrom | ✅ SDK `forkSession` | ✅ session file snapshot-clone | ❌ | ❌ |
| sessionId emission | ✅ from `system/init` | ✅ `message-metadata` | ✅ from `thread.started` (`thread_id`) | ❌ |
| skills | ✅ `skillPaths` mapped to a temp local plugin; `skills` names/`"all"` also exposed | ✅ `skillPaths` + resource loader | ❌ | ❌ |
| custom tools (toolRefs) | ✅ http/module runtimes via in-process SDK MCP server | ✅ http/module runtimes | ❌ (passes through agent-side MCP tool events) | ❌ |
| reasoning stream | ✅ `reasoning` parts (thinking deltas) | ❌ not converted | ✅ `reasoning` parts (diffed from item updates) | ❌ |
| incremental text streaming | ✅ partial messages | ✅ `text_delta` | ✅ diffed `item.updated` deltas | ❌ |
| usage in finish metadata | ✅ | ✅ (+ per-tool usage tally) | ✅ snake_case under `messageMetadata.usage` | ❌ |
| effort / thinking level | ❌ | ✅ `thinkingLevel` | ✅ `modelReasoningEffort` (minimal/low/medium/high/xhigh) | ❌ |
| tool approval (AskUserQuestion) | ✅ file-based approval bridge (`.bunny-agent/approvals/`), infinite wait until answered/aborted | ✅ file-based bridge with parity (all tools gated unless `yolo`/root; AskUserQuestion always gated) | ⚠️ SDK `approvalPolicy` passthrough only | ❌ |
| abort handling | ✅ `query.interrupt()` | ✅ `session.abort()` + forced error finish | ✅ signal passthrough + unexpected-end guard | ⚠️ |
| stream-end error guard | ✅ error dedup + `[DONE]` always | ✅ triple error source + double-finish guard | ✅ synthesizes error+finish when stream ends without terminal event | ❌ |
| multimodal input (images) | ✅ JSON multi-part content | ✅ | ✅ base64 → temp file `local_image` | ❌ |
| auth | API key, `ANTHROPIC_AUTH_TOKEN`, Bedrock proxy, LiteLLM, Vertex (`CLAUDE_CODE_USE_VERTEX`) | any `<PROVIDER>_API_KEY`; unknown providers auto-register as OpenAI-compatible via `<PROVIDER>_BASE_URL` | `CODEX_API_KEY`/`OPENAI_API_KEY` + `OPENAI_BASE_URL` | env keys |
| mock fallback (no auth) | ✅ | ❌ | ❌ | ❌ |
| env/systemEnv isolation | ❌ | ✅ (secrets never reach bash; output redaction) | ❌ | ❌ |

`gemini`/`opencode` now emit `message-metadata.sessionId` from the ACP
`session/new` (or `session/load`) response and accept a `resume` option, so the
harness auto-resume works for them (resume applies when the ACP agent advertises
`loadSession`, e.g. Gemini CLI).

### runner-copilot

Backed by the official `@github/copilot-sdk` (JSON-RPC to the GitHub Copilot
CLI), modelled on runner-codex:

- ✅ sessionId (`CopilotSession.sessionId`), `resume` (`resumeSession`),
  `systemPrompt` (`systemMessage: { mode: "append" }`), model selection
- ✅ incremental text (`assistant.message_delta`), reasoning
  (`assistant.reasoning_delta`), tool calls (`tool.execution_start/complete`
  with `isError`), usage in `finish` metadata, abort (`session.abort()`),
  unexpected-end guard
- ⚠️ permissions use the SDK's `approveAll` helper (effectively yolo); there is
  no approval bridge like claude/pi yet
- ❌ `maxTurns`, `allowedTools`, `toolRefs`, `skills`, image/attachment input
- Auth: `COPILOT_GITHUB_TOKEN` / `GITHUB_TOKEN`; requires the Copilot CLI to be
  installed in the environment

## Known gaps / next steps

- **claude**: `hooks` are not wired; in-process MCP tool refs execute but the
  SDK's richer MCP transports (stdio/websocket servers) are not exposed.
- **pi**: no reasoning stream; no `maxTurns`.
- **codex**: no `maxTurns`/`allowedTools` (SDK limitation); `systemPrompt` is
  emulation (prepended text), so it is not re-applied on `resume`; `file_change`
  items surface as an `apply_patch` tool call; `todo_list` items are dropped.
- **gemini/opencode**: thin wrappers — no systemPrompt, no tools config; resume
  depends on the ACP agent advertising `loadSession`.

## UI-layer compatibility

No per-runner UI work is needed: every runner emits the same AI SDK UI Data
Stream chunk vocabulary and the SDK provider normalizes them into
`LanguageModelV3StreamPart`s. Differences that do show up in the UI:

- `reasoning` parts from claude/codex are converted by the SDK provider into
  `reasoning-start/delta/end` V3 parts, and the example UI now renders them as a
  collapsible "Thinking…" block (`Reasoning` element in `ChatMessage`).
- Auto-resume works for every runner that emits a sessionId (all except when the
  ACP agent lacks `loadSession`).
- Tool call rendering is uniform (`dynamic-tool` parts); only tool *names*
  differ (`shell` vs `bash`, `server:tool` for MCP).

## Tool approval (human-in-the-loop) note

`claude` and `pi` both gate tool execution through a file-based approval bridge
(`.bunny-agent/approvals/<toolCallId>.json`) that the web layer answers via
`submitAnswer`. Semantics are aligned:

- `AskUserQuestion` is **always** gated (even under `yolo`).
- Other tools are gated only when approval is **not** bypassed. Approval is
  bypassed under `yolo` or when running as **root** (mirroring claude's switch
  to `bypassPermissions`; sandboxes typically run as a non-root `agent` user, so
  approval IS active there).
- The wait is **infinite** — it blocks until the user answers or the run is
  aborted; there is no timeout. The web frontend currently only ships an
  approval UI for `AskUserQuestion`; a generic per-tool approval UI is still
  needed for non-root, non-yolo runs to avoid indefinitely pending tool calls.
