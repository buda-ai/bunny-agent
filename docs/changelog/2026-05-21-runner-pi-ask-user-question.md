# 2026-05-21 - runner-pi: AskUserQuestion tool

## Problem

The pi runner had no way for the model to surface a structured choice to the
user mid-run. runner-claude already supports this via Claude Code's
`AskUserQuestion` tool plus a file-based approval roundtrip
(`.bunny-agent/approvals/<toolUseID>.json`), but pi-coding-agent has no
equivalent hook, so pi-driven sessions could only fall back to free-form prose
when they needed disambiguation.

## Changes

- Added `buildAskUserQuestionTool` in `packages/runner-pi/src/`. The tool
  registers as a custom pi `ToolDefinition` named `AskUserQuestion`, accepts
  the same questions/options/multiSelect schema Claude Code uses (1-4
  questions, 2-4 options each), and writes a pending approval file for the
  frontend to answer. The file shape (`status`, `toolName`, `input`,
  `questions`, `answers`, `reason`) matches what runner-claude's
  `canUseTool` writes, so existing approval UIs serve both runners with no
  changes.
- Wired the tool into `createPiRunner`'s `customTools`. Like every other pi
  tool, callers opt in by including `"AskUserQuestion"` in their
  `allowedTools` list — that keeps the runner's allowlist semantics
  consistent across all tools, and avoids silently exposing user-prompt
  capability to callers that did not ask for it.
- Updated `apps/web/app/api/ai/route.ts` to add `"AskUserQuestion"` to its
  `allowedTools` so the bundled web example surfaces the tool to the
  model.
- Borrowed openclaw's display-text sanitization
  (`extensions/codex/src/app-server/elicitation-bridge.ts`) to strip ANSI
  escapes and other control characters from question/header/option text before
  the approval file is written. Length caps mirror the same module.
- Default timeout is 120 s (matching openclaw's
  `DEFAULT_CODEX_APPROVAL_TIMEOUT_MS`), longer than runner-claude's 60 s
  because users often need real time to read multi-option prompts. The poll
  loop is also wired to the pi `AbortSignal`, so an aborted run terminates the
  prompt immediately instead of running out the clock.
- Added the `ASK_USER_QUESTION_TOOL_TIMEOUT` environment variable (in
  seconds) to override the default. Resolved via the runner's standard order:
  `options.env` first, then `process.env`, then the built-in default. Invalid
  or non-positive values fall back to the default.

## Verification

- `pnpm --filter @bunny-agent/runner-pi typecheck`
- `pnpm --filter @bunny-agent/runner-pi test` (121 tests, including 8 new
  tests covering happy path, multi-select, decline, timeout, abort, sanitize,
  and approval-file cleanup)
- `pnpm lint`

## Files Changed

- `packages/runner-pi/src/ask-user-question-tool.ts` (new)
- `packages/runner-pi/src/__tests__/ask-user-question-tool.test.ts` (new)
- `packages/runner-pi/src/pi-runner.ts`
- `packages/runner-pi/src/index.ts`
- `apps/web/app/api/ai/route.ts`
