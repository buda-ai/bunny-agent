# SDK streamText tools parameter support — external tool execution on user's server

## Session log (2026-04-22 — revision 2)

**Problem**: The initial implementation forwarded all `streamText({ tools })` names as agent `allowedTools`, treating user-defined tools as sandbox-internal agent tools. This is wrong: `streamText.tools` are user tools with `execute` functions that must run on the caller's server (via the AI SDK standard `maxSteps` mechanism), not in the sandboxed agent.

**Changes made:**

### `packages/sdk/src/provider/bunny-agent-language-model.ts`

- **Removed** auto-derivation of `allowedTools` from `streamText.tools` inside `doStream`.
  - `allowedTools` for the agent is now sourced only from provider-level settings (`createBunnyAgent({ allowedTools: [...] })`).
  - `resolveRequestAllowedTools` is kept as an exported utility for callers who explicitly want to derive allowed tools from `streamText` options.
- **Added** `EXTERNAL_TOOL_CALL_MARKER` / `EXTERNAL_TOOL_RESULT_MARKER` constants (exported).
- **Added** `parseExternalToolCallMarker(line)` — parses `__BUNNY_TOOL_CALL__:` JSON lines emitted by the agent.
- **Added** `buildExternalToolsSection(tools)` — builds a system-prompt section injected into the agent describing available external tools and their calling convention.
- **Added** `applyExternalToolMarkerFilter(stream, toolNames)` — transforms the AI SDK stream: detects `__BUNNY_TOOL_CALL__:` lines in `text-delta` events and re-emits them as `tool-call` stream parts (without `providerExecuted`), which the AI SDK will route to the user's `execute` function.
- **Updated** `doStream` to:
  - Extract external tools from `options.tools`.
  - Inject their schemas + calling instructions into the system prompt (both daemon and CLI paths).
  - Apply `applyExternalToolMarkerFilter` on the outgoing stream.
- **Updated** `buildCodingRunBody` — removed `requestAllowedTools` parameter; `allowedTools` always comes from provider settings; `externalToolsSection` is merged into `systemPrompt`.
- **Updated** `buildStreamResult` — accepts optional `externalToolNames` and applies the marker filter.
- **Added** `safeParseJson` helper for safely deserialising tool `input` strings.
- **Updated** `convertPromptToMessages`:
  - `case "assistant"`: now includes tool-call parts (reconstructed as markers) so resumed sessions have consistent history.
  - `case "tool"`: now converts tool-result messages to user messages carrying `__BUNNY_TOOL_RESULT__:` lines, enabling multi-step `maxSteps` round-trips.

### `packages/sdk/src/provider/index.ts` / `packages/sdk/src/index.ts`

- Exported all new constants and helpers: `EXTERNAL_TOOL_CALL_MARKER`, `EXTERNAL_TOOL_RESULT_MARKER`, `parseExternalToolCallMarker`, `buildExternalToolsSection`, `applyExternalToolMarkerFilter`.

### `packages/sdk/src/__tests__/bunny-agent-language-model.test.ts`

- Replaced all 4 existing `resolveRequestAllowedTools` tests (kept intact).
- Added 5 tests for `parseExternalToolCallMarker`.
- Added 4 tests for `buildExternalToolsSection`.
- Added 6 tests for `applyExternalToolMarkerFilter` (including the `text-end` incomplete-line edge case and the pass-through-unchanged case).

## Architecture: external tool calling convention

When `streamText({ tools: { myTool: tool({ execute }) } })` is used with BunnyAgent:

1. **System prompt injection**: The agent's system prompt is augmented with a description of `myTool` and the calling convention.
2. **Agent emits marker**: When the agent wants to call `myTool`, it outputs:
   `__BUNNY_TOOL_CALL__: {"id":"<unique>","name":"myTool","args":{...}}`
   on its own line, then stops.
3. **SDK intercepts**: `applyExternalToolMarkerFilter` converts this line to a `tool-call` stream part (no `providerExecuted`).
4. **AI SDK executes tool**: The AI SDK sees the non-providerExecuted `tool-call`, calls `myTool.execute()` on the user's server.
5. **Next step**: The AI SDK calls `doStream` again with the tool result message in the prompt.
6. **Tool result**: `convertPromptToMessages` converts the `tool` message to a user message containing:
   `__BUNNY_TOOL_RESULT__: {"id":"...","name":"myTool","result":{...}}`
7. **Agent resumes**: The agent reads the result and continues its work.

## Validation log

- `corepack pnpm --filter @bunny-agent/sdk build` — passed.
- `corepack pnpm --filter @bunny-agent/sdk test` — 22/22 tests passed.

---

## Original session log (2026-04-22 — revision 1)

- Reviewed `@bunny-agent/sdk` provider flow and confirmed `LanguageModelV3CallOptions.tools` was not being propagated to runner execution.
- Added per-request tool resolution in `packages/sdk/src/provider/bunny-agent-language-model.ts`:
  - `streamText` call options now resolve tool names from `options.tools`.
  - Resolved tool names are forwarded to daemon body (`allowedTools`) and CLI runner invocation (`runner.allowedTools`) for that request.
  - Existing provider-level defaults remain the fallback when `streamText` tools are omitted.
- Added test coverage in `packages/sdk/src/__tests__/bunny-agent-language-model.test.ts`.
- Updated `packages/sdk/README.md` API reference.
- Extracted `resolveRequestAllowedTools(...)` as a module-level helper.

