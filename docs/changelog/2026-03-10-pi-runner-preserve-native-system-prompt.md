# Pi runner: Preserve native system prompt instead of overriding

Date: 2026-03-10
Author: AI Assistant
AI Agent: Kiro

## Prompts & Instructions

**Original Request:**
> apps/buda/src/domains/agent/logic/chat-service.ts, when chatting with the agent, the server log shows it executes the runner-cli with `--runner pi`. According to Pi agent docs, it supports appending system prompt via CLI. How should I modify apps/buda code to support appending system prompt?

**Refined Instructions:**
- Investigate why `.pi/SYSTEM.md` and `.pi/APPEND_SYSTEM.md` placed in the sandbox workdir are not being read by the Pi runner
- Trace the full call chain from chat-service through to Pi's createAgentSession
- Identify root cause: createPiRunner() unconditionally overwrites Pi's native system prompt
- Fix the Pi runner to preserve Pi's native system prompt

## What Changed

The Pi runner previously unconditionally overwrote the system prompt that Pi's `createAgentSession()` builds from context files.

Before (broken): `setSystemPrompt(options.systemPrompt)` or `setSystemPrompt("You are a helpful coding assistant.")` was always called, discarding everything Pi loaded from `.pi/SYSTEM.md`, `.pi/APPEND_SYSTEM.md`, `AGENTS.md`, and skills.

After (fixed): When no `--system-prompt` is passed, Pi's native system prompt is preserved. When `--system-prompt` is passed, the CLI value is appended to Pi's native system prompt instead of replacing it.

## Why

Pi's `createAgentSession()` internally calls `DefaultResourceLoader.reload()` which discovers and loads `.pi/SYSTEM.md`, `.pi/APPEND_SYSTEM.md`, `AGENTS.md`/`CLAUDE.md` context files, and skills. The unconditional `setSystemPrompt()` call threw all of this away. Users placing context files in the sandbox workdir had no effect, breaking Pi's documented context file mechanism when running through SandAgent.

## Files Affected

- `packages/runner-pi/src/pi-runner.ts` - Removed unconditional system prompt override; now preserves Pi's native system prompt and only appends when `--system-prompt` CLI flag is explicitly provided

## Breaking Changes

- The hardcoded `"You are a helpful coding assistant."` fallback is removed. Pi's native system prompt (from context files) is used instead. This is the correct behavior per Pi's documentation.

## Testing

1. Place a `.pi/APPEND_SYSTEM.md` file in the sandbox workdir with custom instructions
2. Run the Pi runner via SandAgent without `--system-prompt`
3. Verify the agent behavior reflects the content of `.pi/APPEND_SYSTEM.md`
4. Run with `--system-prompt "extra"` and verify both Pi's native prompt and the CLI prompt are present
