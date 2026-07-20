# Add native apply_patch tool to runner-pi for OpenAI-provider models

Date: 2026-07-17

## Why

GPT-5.1 and the Codex model family are trained heavily against OpenAI's
`apply_patch` tool — a context-addressed diff format ("V4A") delimited by
`*** Begin Patch` / `*** Update File: ...` / `*** End Patch`, exposed natively
in the Responses API and as a shell-level command in Codex CLI. When pi
runner ran these models through its usual read/write/edit/bash tool set (no
`apply_patch`), the model reached for the tool anyway: it emitted an
unrecognized bare tool call, or piped `apply_patch <<'PATCH'` through bash,
which fails because no sandbox ships that binary. Observed failure mode: the
model tries `apply_patch` via bash, gets "not installed", then falls back to
the `write` tool — three tool calls for what should be one, and confusing
tool-call noise in the transcript.

## What Changed

- `packages/runner-pi/src/apply-patch-tool.ts` (new): parses the V4A patch
  format (`Update File` / `Add File` / `Delete File` / `Move to`, `@@` hunk
  markers, ` `/`-`/`+` prefixed lines) and applies it to disk. Hunks are
  matched by surrounding context rather than line numbers, with a tolerant
  exact → rstrip → full-trim fallback (mirrors OpenAI's reference
  implementation) for minor whitespace drift in model-generated context.
  Exposed as a `ToolDefinition` named `apply_patch`.
- `packages/runner-pi/src/pi-runner.ts`: registers `buildApplyPatchTool(cwd)`
  as a custom tool only when the resolved provider is `openai` — that's the
  model family with this specific training prior; other providers don't
  benefit and gain unnecessary tool-description bloat.
- `docs/runner-maturity.md`: documented the new pi-runner behavior under
  known gaps.

## Testing

- Unit: 10 new tests in `apply-patch-tool.test.ts` (add/update/delete/move,
  multi-hunk, whitespace-tolerant matching, error paths for missing context
  and empty patches) + full `runner-pi` suite (142/142 passing).
- `pnpm --filter @bunny-agent/runner-pi typecheck` and `pnpm run -w lint`
  both clean.
