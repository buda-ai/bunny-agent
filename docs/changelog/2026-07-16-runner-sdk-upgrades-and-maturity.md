# Runner SDK upgrades and maturity alignment

## SDK upgrades

- `@anthropic-ai/claude-agent-sdk` 0.2.70 → 0.3.211 (runner-claude); added a
  direct `@anthropic-ai/sdk@0.111.0` dependency to satisfy the new peer range.
- `@earendil-works/pi-coding-agent` / `pi-agent-core` / `pi-ai` 0.78.0 → 0.80.7
  (runner-pi). Breaking change handled: root `getModel` export was removed;
  now using `getBuiltinModel` from `@earendil-works/pi-ai/providers/all`
  (same undefined-on-miss semantics). Image models moved to a separate
  catalog; production code was unaffected (image tools call HTTP APIs
  directly), but the test mock in `pi-runner.test.ts` had to follow the new
  import path — the stale mock caused 4 cascading test failures.
- `@openai/codex-sdk` ^0.120.0 → 0.144.5 (runner-codex).

## runner-codex maturity alignment (with runner-pi)

`packages/runner-codex/src/codex-runner.ts` streaming rewritten:

- Emits `start` + `message-metadata` with `sessionId` (from `thread.started`
  / `thread.id`), so harness `captureSessionId` auto-resume now works for
  codex.
- Incremental text streaming: `item.started/updated/completed` events for
  `agent_message` are diffed into proper `text-start`/`text-delta`/`text-end`
  parts (previously only whole-message text on completion).
- Reasoning emitted as `reasoning` parts (runner-claude parity) instead of
  `[Reasoning]`-prefixed text.
- `file_change` items surface as an `apply_patch` tool call; error items get
  proper text part framing.
- `finish` now carries usage under `messageMetadata.usage` in snake_case so
  the SDK provider's `normalizeBunnyAgentUsage` picks it up (top-level
  `usage` was silently dropped before).
- `systemPrompt` emulated by prepending to the first input on fresh threads
  (the Codex SDK has no instructions option).
- Guard: if the event stream ends without a terminal turn event, an explicit
  `error` + `finish` + `[DONE]` is synthesized instead of silently closing.
- Harness now maps `effort` → codex `modelReasoningEffort`.

## runner-claude maturity alignment

- `forkFrom` support: maps to SDK `resume` + `forkSession: true`
  (`ClaudeRunnerOptions.forkFrom`), wired through harness dispatch.
- `skills` option (`string[] | "all"`) exposed on `ClaudeRunnerOptions`,
  passed to the SDK's first-class `skills` option.
- Harness now passes `cwd` to the claude runner (previously omitted).

## Docs

- New living document `docs/runner-maturity.md`: SDK versions + capability
  matrix + known gaps + UI-layer compatibility notes for all runners.
- `CLAUDE.md`: fixed stale pi package name (`@mariozechner/pi-coding-agent` →
  `@earendil-works/pi-coding-agent`), updated runner list, linked the
  maturity doc.

All builds green; tests: runner-pi 130/130, runner-claude 49/49,
runner-codex 5/5.

## Follow-up alignment fixes

- `packages/runner-pi/src/pi-runner.ts`: `systemPrompt` no longer depends on
  `skillPaths` — the resource loader is created whenever either is set, so a
  bare systemPrompt is not silently dropped anymore.
- `packages/sdk/src/provider/bunny-agent-language-model.ts`: new `reasoning`
  chunk handling — untagged reasoning deltas from runners (claude/codex) are
  wrapped into `reasoning-start/delta/end` LanguageModelV3 parts (closed on
  text-start / tool-input-start / finish), and `doGenerate` aggregates them
  into `reasoning` content. Reasoning was previously dropped by the provider.
- `apps/runner-cli`: SDK dependencies synced to the same versions
  (claude-agent-sdk 0.3.211, pi 0.80.7, codex-sdk 0.144.5).
- pnpm patch for `@earendil-works/pi-coding-agent` migrated 0.78.0 → 0.80.7
  (same edits: appendSystemPrompt replaces the default pi system prompt, and
  piConfig uses name "bunny" / configDir ".bunny").
