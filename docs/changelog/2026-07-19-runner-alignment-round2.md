# Runner alignment round 2

Follow-up to the SDK upgrades: close the remaining maturity gaps across runners
and surface reasoning in the UI.

## Example UI

- `apps/web/app/(example)/example/page.tsx`: render `reasoning` message parts
  as a collapsible "Thinking…" block using kui's `Reasoning` element, instead of
  dropping them (`return null`). Reasoning from claude/codex is now visible.

## runner-pi — tool approval (human-in-the-loop)

- New `packages/runner-pi/src/tool-approval.ts`: a file-based approval bridge
  with parity to runner-claude (`.bunny-agent/approvals/<toolCallId>.json`, same
  JSON shape so the web `submitAnswer` / AskUserQuestion UI works unchanged).
  - `AskUserQuestion` is a first-class custom tool, always gated.
  - All other tools are gated unless approval is bypassed. Bypass = `yolo` or
    running as **root** (mirrors claude switching to `bypassPermissions`).
  - The wait is **infinite** — blocks until the user answers or the run aborts;
    no timeout (aligned to how a human actually answers).
- `pi-runner.ts`: wires the gate (previously the `yolo` option was dead).

## runner-claude — parity additions

- `packages/runner-claude/src/tool-refs.ts`: serializable `toolRefs`
  (http/module runtimes) converted into an in-process SDK MCP server via
  `createSdkMcpServer`; MCP tool names added to `allowedTools`.
- `packages/runner-claude/src/skill-plugin.ts`: `skillPaths` directories wrapped
  into a temporary local plugin (SDK `plugins` option) so claude discovers them
  as skills; `skills` (names/`"all"`) also exposed.
- `hasClaudeAuth`: now also accepts Vertex config
  (`CLAUDE_CODE_USE_VERTEX=1` + `ANTHROPIC_VERTEX_PROJECT_ID` + `CLOUD_ML_REGION`,
  credentials via ADC), alongside the existing Bedrock proxy handling.
- Approval polling switched from a 60s timeout to an infinite wait bounded only
  by the tool's abort signal (parity with pi; humans may take arbitrarily long).

## runner-gemini / runner-opencode — session identity

- Both now emit `message-metadata.sessionId` from the ACP `session/new` (or
  `session/load`) response, enabling harness auto-resume.
- New `resume` option: sends ACP `session/load` when the agent advertises
  `loadSession` (e.g. Gemini CLI), else falls back to `session/new`. Replayed
  history from `session/load` is skipped so resumed runs only stream new output.

## Harness

- `dispatchRunner` passes `toolRefs`/`skillPaths` to claude (previously
  pi-only), and `resume` to gemini/opencode. `RunnerCoreOptions.toolRefs` is now
  a shared structural `RunnerToolRef` type consumed by both claude and pi.

## Docs

- `docs/runner-maturity.md`: capability matrix updated for all of the above,
  plus a dedicated tool-approval section documenting the shared semantics and
  the remaining gap (web needs a generic per-tool approval UI for non-root,
  non-yolo runs).

## New: runner-copilot

- New package `packages/runner-copilot` using the official `@github/copilot-sdk`
  (1.0.7, JSON-RPC to the GitHub Copilot CLI), modelled on runner-codex.
  Supports sessionId + `resume`, `systemPrompt` (`systemMessage` append mode),
  incremental text and reasoning deltas, tool execution events with `isError`,
  usage in `finish` metadata, abort, and the unexpected-end guard.
  Permissions currently use the SDK's `approveAll` helper (yolo semantics).
- `runner-harness` dispatches `copilot` instead of throwing "not yet
  implemented"; added as a peer dependency, and to runner-cli's deps + esbuild
  externals. The CLI already accepted `--runner copilot`.

## Main branch integration

- Merged the latest `origin/main` and resolved the lockfile by retaining the
  Copilot SDK entries while adopting main's current Pi patch hash.
- Revalidated all 22 workspace test projects and typechecks, the repository
  lint, the runner CLI build/help output, and a mock Claude stream through
  `[DONE]`.
