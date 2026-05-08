# 2026-05-08 — Fix markdown newline stripping in pi runner text stream

## Problem

When switching from Gemini Pro to GPT-5.4 via the pi runner, returned markdown
rendered with block syntax collapsed inline: `###`, `---`, list items, and
paragraph breaks appeared glued to adjacent text, e.g. `"。---##先说"` instead
of `"。\n\n---\n\n## 先说"`. Frontend markdown parsers require these tokens at
the start of a line, so block-level elements failed to render.

## Root cause

`packages/runner-pi/src/tool-overrides.ts` `redactSecrets()` ended with
`return result.trim()` plus `/\n{3,}/g → "\n\n"` normalization. In
`packages/runner-pi/src/pi-runner.ts`, this was invoked via `redactText` on
every `text_delta` event in `packages/runner-pi/src/stream-converter.ts`
`emitTextDelta()`.

Each streaming delta was therefore trimmed independently. Gemini tends to
pack newlines into chunk interiors (`"。\n\n### 标题..."`), so `.trim()` only
touched harmless leading/trailing whitespace. GPT tends to stream newlines as
standalone deltas (`"。"` / `"\n\n---\n\n"` / `"## "` / `"先说"`). Trimming
each fragment dropped every newline, producing `"。---##先说"` when
concatenated downstream.

## Why redaction on text deltas was wrong anyway

- `bash` and `read` tools already redact secrets at their source
  (`redactResultContent`) before the LLM sees them.
- Env-dump commands (`env`, `printenv`, `export -p`, `declare -x`) are
  blocked by `isEnvDumpCommand`.
- Secrets are injected via `spawnHook`, so they never hit argv or procfs.
- Streaming redaction is unreliable: a secret split across two deltas
  wouldn't match any substring in either chunk.
- `web_fetch` / `web_search` return external content that cannot contain
  user env values.

In short: LLMs can't see the original secret in the first place, so
redacting text deltas was redundant defense theater, and — because of
`.trim()` — actively harmful.

## Fix

Removed the `redactText` option from `PiAISDKStreamConverter` entirely.
- `emitTextDelta` passes the raw delta through unchanged.
- Tool output `tool_execution_end` path now calls `normalizeToolOutput`
  directly; the redaction that used to run there was duplicative of
  `redactResultContent` in the tool wrappers.
- `pi-runner.ts` no longer imports `redactSecrets`; the function is still
  exported for `redactResultContent` usage inside `tool-overrides.ts`.

## Tests

Added `packages/runner-pi/src/__tests__/stream-converter.test.ts`:
1. Single delta containing leading + trailing `\n\n` is emitted verbatim.
2. GPT-style fragmented deltas (`"。"`, `"\n\n---\n\n"`, `"## "`, `"先说"`)
   concatenate to `"。\n\n---\n\n## 先说"` — the exact pattern from the
   real SSE trace.

All existing runner-pi tests (113 total) pass. `tsc --noEmit` is clean for
the package.

## Files changed

- `packages/runner-pi/src/stream-converter.ts`
- `packages/runner-pi/src/pi-runner.ts`
- `packages/runner-pi/src/__tests__/stream-converter.test.ts` (new)
- `.changeset/fix-pi-runner-markdown-newlines.md` (new)
