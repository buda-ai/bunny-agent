# 2026-03-30 - Pi Runner: Bash env injection + secret scrubbing

## Summary

Updated `@sandagent/runner-pi` so request `PiRunnerOptions.env` values are available
inside Pi `bash` tool execution, and so any injected secret values are scrubbed
from tool outputs before they reach the LLM.

## Details

- `packages/runner-pi/src/pi-runner.ts`
  - Root cause: `createAgentSession(options.tools)` in pi-coding-agent only preserves
    tool *names*, rebuilding the internal registry from built-in factories — so any
    `spawnHook` set via `createCodingTools` were silently discarded.
  - Fix: register a custom `ToolDefinition` named `"bash"` via `customTools`.
    `AgentSession` overwrites the built-in bash tool entry during `_refreshToolRegistry`,
    so our custom bash is the one that actually executes.
  - Implementation details:
    - the custom `"bash"` tool delegates to pi's `createBashTool()` and injects
      `PiRunnerOptions.env` into the subprocess spawn context via `spawnHook`.
    - the custom tool scrubs injected secret values from the tool result content
      inside `execute()` (before pi stores the result into the LLM conversation history),
      preventing the model from repeating secrets in its text response.
  - This override is only registered when `options.env` is non-empty; default behaviour
    is unchanged otherwise.
- `packages/runner-pi/src/__tests__/pi-runner.test.ts`
  - Update tests to match new implementation: verify `customTools` contains a `bash`
    entry when `options.env` is set, and that `process.env` is not mutated.
  - Add pi's `createBashTool` to the vi mock so the custom tool can be instantiated
    in test context.

## Why

`createCodingTools(cwd, { bash: { spawnHook } })` never worked in this pi-coding-agent
version because `createAgentSession` strips tool implementations. The `customTools`
path is the correct override mechanism supported by `AgentSession`.
