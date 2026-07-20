# Surface automatic context compaction in the UI

The agent SDKs behind claude, copilot and pi already compact the conversation
automatically when the context window fills — we just never showed it. Now the
runners that can observe compaction report it, and the UI renders a
"Compacting conversation…" indicator while it happens.

## Runners

- `packages/runner-claude/src/ai-sdk-stream.ts`: handle `system/status`
  (`status: "compacting"` → compaction start; `compact_result` → end) and
  `system/compact_boundary` (end, with `trigger` / `pre_tokens` / `post_tokens`).
- `packages/runner-copilot/src/copilot-runner.ts`: handle
  `session.compaction_start` and `session.compaction_complete` (success,
  pre/post tokens, error).

Both emit the same chunk shape:
`{"type":"compaction","phase":"start"|"end",success?,trigger?,preTokens?,postTokens?,error?}`.

Not covered: **pi** compacts automatically but only exposes it through its
extension API (`session_before_compact` / `session_compact`), which we do not
register yet; **codex**'s SDK exposes no compaction event at all.

## SDK provider

- New `CompactionEvent` type and `onCompaction` provider setting. The AI SDK
  stream protocol has no part type for compaction and it must not become
  assistant content, so the provider delivers it out-of-band via the callback
  rather than as a stream part.

## Web

- `apps/web/app/api/ai/route.ts`: `onCompaction` writes a **transient**
  `data-compaction` part (transient → not persisted into message history).
- `useBunnyAgentChat`: consumes it via `onData` and exposes a `compaction`
  state (non-null only while compaction is running).
- Example UI: renders "Compacting conversation (N k tokens)…" in place of the
  regular loader while compacting.

## Not in this change

Context-usage percentage ("34% context"). Researched and documented in
`docs/runner-maturity.md`: claude has `query.getContextUsage()` (returns
`percentage` directly), copilot has `session.usage_info`
(`currentTokens`/`tokenLimit`), pi can compute it from `Model.contextWindow` —
but `pi-runner.ts` currently hardcodes `contextWindow: 128000` for
auto-registered models, which must be fixed first. Codex exposes no context
window, so a percentage is not derivable there without a hardcoded lookup table.
