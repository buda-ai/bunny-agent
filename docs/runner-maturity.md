# Runner Integration Maturity

> Living document — update this whenever a runner gains/loses a capability,
> an SDK is upgraded, or a new runner lands. Last updated: 2026-07-17.

Architecture recap:

```
UI (useBunnyAgentChat) → /api/ai → SDK provider (packages/sdk, LanguageModelV3)
  → daemon (/api/coding/run) or CLI (bunny-agent run)
    → runner-harness (dispatchRunner) → runner-claude | runner-pi | runner-codex | runner-gemini | runner-opencode
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
| runner-gemini | ACP subprocess wrapper | — |
| runner-opencode | ACP subprocess wrapper | — |
| runner-copilot | not implemented (throws) | — |

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
| skills | ⚠️ SDK `skills` option exposed on ClaudeRunnerOptions; `skillPaths` dirs not mapped (skills come from settings/plugins) | ✅ `skillPaths` + resource loader | ❌ | ❌ |
| custom tools (toolRefs) | ❌ (SDK MCP servers not wired) | ✅ http/module runtimes | ❌ (passes through agent-side MCP tool events) | ❌ |
| reasoning stream | ✅ `reasoning` parts (thinking deltas) | ❌ not converted | ✅ `reasoning` parts (diffed from item updates) | ❌ |
| incremental text streaming | ✅ partial messages | ✅ `text_delta` | ✅ diffed `item.updated` deltas | ❌ |
| usage in finish metadata | ✅ | ✅ (+ per-tool usage tally) | ✅ snake_case under `messageMetadata.usage` | ❌ |
| effort / thinking level | ❌ | ✅ `thinkingLevel` | ✅ `modelReasoningEffort` (minimal/low/medium/high/xhigh) | ❌ |
| tool approval (AskUserQuestion) | ✅ file-based approval bridge (`.bunny-agent/approvals/`) | ❌ (`yolo` option exists but unused) | ⚠️ SDK `approvalPolicy` passthrough only | ❌ |
| abort handling | ✅ `query.interrupt()` | ✅ `session.abort()` + forced error finish | ✅ signal passthrough + unexpected-end guard | ⚠️ |
| stream-end error guard | ✅ error dedup + `[DONE]` always | ✅ triple error source + double-finish guard | ✅ synthesizes error+finish when stream ends without terminal event | ❌ |
| multimodal input (images) | ✅ JSON multi-part content | ✅ | ✅ base64 → temp file `local_image` | ❌ |
| auth | API key, `ANTHROPIC_AUTH_TOKEN`, Bedrock proxy, LiteLLM (no Vertex) | any `<PROVIDER>_API_KEY`; unknown providers auto-register as OpenAI-compatible via `<PROVIDER>_BASE_URL` | `CODEX_API_KEY`/`OPENAI_API_KEY` + `OPENAI_BASE_URL` | env keys |
| mock fallback (no auth) | ✅ | ❌ | ❌ | ❌ |
| env/systemEnv isolation | ❌ | ✅ (secrets never reach bash; output redaction) | ❌ | ❌ |

## Known gaps / next steps

- **claude**: `mcpServers`, `hooks`, in-process custom tools (`toolRefs`),
  Vertex auth, and `skillPaths`-style directory loading are not wired.
  `skills` (names/`"all"`) is exposed on `ClaudeRunnerOptions` but not plumbed
  through the harness yet.
- **pi**: no reasoning stream; no approval flow (`yolo` dead); no `maxTurns`.
  For `openai`-provider models, a native `apply_patch` tool (V4A context-diff
  format) is registered alongside the built-in read/write/edit/bash tools,
  since GPT-5.1/Codex-family models are trained to reach for `apply_patch`
  by default and otherwise fall back to invoking a nonexistent CLI via bash.
  `apply_patch` additionally exists as a real shell command in bash children:
  the runner prepends a PATH shim (`apply-patch-shim.ts`) execing the
  standalone `apply-patch-bin.js`, and sandbox images install it globally at
  `/usr/local/bin/apply_patch` — this covers heredoc invocations chained
  after other commands (`cd x && apply_patch <<'PATCH'`), which no tool
  registration can intercept.
- **codex**: no `maxTurns`/`allowedTools` (SDK limitation); `systemPrompt` is
  emulation (prepended text), so it is not re-applied on `resume`; `file_change`
  items surface as an `apply_patch` tool call; `todo_list` items are dropped.
- **gemini/opencode**: thin wrappers — no session, no systemPrompt, no tools
  config. **copilot**: not implemented.

## UI-layer compatibility

No per-runner UI work is needed: every runner emits the same AI SDK UI Data
Stream chunk vocabulary and the SDK provider normalizes them into
`LanguageModelV3StreamPart`s. Differences that do show up in the UI:

- `reasoning` parts from claude/codex are converted by the SDK provider into
  `reasoning-start/delta/end` V3 parts, so the AI SDK surfaces them as
  `reasoning` UI message parts. The example UI does not render reasoning parts
  yet (they fall through to `return null` in `ChatMessage`).
- Runners without sessionId emission (gemini/opencode) silently lose
  auto-resume; the chat works but every turn starts fresh.
- Tool call rendering is uniform (`dynamic-tool` parts); only tool *names*
  differ (`shell` vs `bash`, `server:tool` for MCP).
