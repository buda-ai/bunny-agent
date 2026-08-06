# Runner Integration Maturity

> Living document — update this whenever a runner gains/loses a capability,
> an SDK is upgraded, or a new runner lands. Last updated: 2026-07-20.

Architecture recap:

```
UI (useBunnyAgentChat) → /api/ai → SDK provider (packages/sdk, LanguageModelV3)
  → daemon (/api/coding/run) or CLI (bunny-agent run)
    → runner-harness (dispatchRunner) → runner-claude | runner-pi | runner-codex | runner-gemini | runner-opencode | runner-copilot
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
| runner-claude | `@anthropic-ai/claude-agent-sdk` (in-process) | 0.3.215 |
| runner-pi | `@earendil-works/pi-coding-agent` / `pi-agent-core` / `pi-ai` | 0.80.10 |
| runner-codex | `@openai/codex-sdk` (official, in-process) | 0.144.6 |
| runner-gemini | `@agentclientprotocol/sdk` (Gemini CLI subprocess) | 1.2.1 |
| runner-opencode | `@agentclientprotocol/sdk` (OpenCode CLI subprocess) | 1.2.1 |
| runner-copilot | `@github/copilot-sdk` (Copilot CLI subprocess) | 1.0.7 |

## Capability matrix

Legend: ✅ supported · ⚠️ partial/caveat · ❌ not supported

| Capability | claude | pi | codex | gemini/opencode | copilot |
|---|---|---|---|---|---|
| systemPrompt | ✅ SDK option | ✅ via resource loader (`appendSystemPrompt`) | ⚠️ prepended on fresh threads | ⚠️ prepended to each new ACP session | ✅ SDK system message |
| maxTurns | ✅ | ❌ no such concept | ❌ SDK has no option | ❌ | ❌ SDK has no option |
| allowedTools | ✅ (+ forced Skill/WebSearch/WebFetch) | ✅ filters built-in + custom + toolRefs | ❌ SDK has no option | ❌ ACP has no standard allowlist | ✅ SDK filter |
| resume | ✅ | ✅ (>10MB OOM guard + compaction fallback) | ✅ `resumeThread` | ❌ session ID is emitted but load/resume is not wired | ✅ `resumeSession` |
| forkFrom | ✅ SDK `forkSession` | ✅ session snapshot-clone | ❌ | ❌ | ❌ |
| sessionId emission | ✅ from `system/init` | ✅ | ✅ from `thread.started` | ✅ from `session/new` | ✅ from SDK session |
| skills | ⚠️ SDK names/`"all"`; harness paths not mapped | ✅ `skillPaths` + resource loader | ❌ | ⚠️ agent CLI discovery only | ✅ Copilot config discovery |
| custom tools (toolRefs) | ❌ | ✅ http/module runtimes | ❌ (passes through MCP events) | ❌ | ❌ SDK supports tools, but Bunny `toolRefs` are not mapped |
| reasoning stream | ✅ | ❌ not converted | ✅ | ✅ ACP thought chunks | ✅ SDK reasoning deltas |
| incremental text streaming | ✅ | ✅ | ✅ | ✅ ACP message chunks | ✅ SDK message deltas |
| usage in finish metadata | ✅ | ✅ (+ per-tool usage) | ✅ | ✅ ACP prompt usage | ✅ accumulated SDK usage |
| effort / thinking level | ❌ | ✅ | ✅ minimal/low/medium/high/xhigh | ❌ | ✅ low/medium/high/xhigh |
| tool approval | ✅ file bridge | ❌ (`yolo` remains unused) | ⚠️ SDK policy passthrough | ✅ file bridge / `yolo` | ✅ file bridge / `yolo` |
| abort handling | ✅ | ✅ | ✅ | ✅ process termination | ✅ `session.abort()` |
| stream-end error guard | ✅ | ✅ | ✅ | ✅ | ✅ |
| multimodal input (images) | ✅ | ✅ | ✅ base64 to temp file | ❌ | ❌ |
| auth | Anthropic key/token, Bedrock proxy, LiteLLM | provider environment and custom endpoints | OpenAI/Codex key and base URL | agent CLI environment | logged-in Copilot user or GitHub token |
| mock fallback (no auth) | ✅ | ❌ | ❌ | ❌ | ❌ |
| env/systemEnv isolation | ❌ | ✅ | ❌ | ❌ | ❌ |

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
  registration can intercept. The V4A parsing/applying engine and CLI live in
  `packages/apply-patch` (`@bunny-agent/apply-patch`), a standalone package
  with no pi dependency — runner-pi wraps it as the native tool and the PATH
  shim, while `apps/runner-cli`/`apps/daemon` each bundle its CLI entry
  directly for their own sandbox binaries, without depending on runner-pi.
- **codex**: no `maxTurns`/`allowedTools` (SDK limitation); `systemPrompt` is
  emulation (prepended text), so it is not re-applied on `resume`; `file_change`
  items surface as an `apply_patch` tool call; `todo_list` items are dropped.
- **gemini/opencode**: ACP 1.x now provides typed streaming, session metadata,
  usage, reasoning, tool events, permissions, and complete error streams. ACP
  load/resume and standard tool filtering are not wired.
- **copilot**: `toolRefs`, image inputs, `forkFrom`, and `maxTurns` are not
  wired. The SDK's stdio transport is used; its experimental in-process FFI
  transport is intentionally not enabled.

## UI-layer compatibility

No per-runner UI work is needed: every runner emits the same AI SDK UI Data
Stream chunk vocabulary and the SDK provider normalizes them into
`LanguageModelV3StreamPart`s. Differences that do show up in the UI:

- `reasoning` parts from claude/codex/ACP/copilot are converted by the SDK provider into
  `reasoning-start/delta/end` V3 parts, so the AI SDK surfaces them as
  `reasoning` UI message parts. The example UI does not render reasoning parts
  yet (they fall through to `return null` in `ChatMessage`).
- Gemini and OpenCode emit session IDs, but their ACP load/resume path is not
  wired yet, so every process invocation still starts a fresh session.
- Tool call rendering is uniform (`dynamic-tool` parts); only tool *names*
  differ (`shell` vs `bash`, `server:tool` for MCP).
