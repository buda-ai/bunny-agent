# 2026-05-27 - runner-pi: bundled extensions (todo, plan-mode, goal, subagent)

## Problem

The pi runner exposed only the base coding tools plus AskUserQuestion. There
was no way for the model to track tasks across turns, slow down for a
read-only audit before editing, persistently pursue a long-running objective,
or delegate work to isolated child sessions. Each of these patterns already
exists upstream as pi-coding-agent / pi-goal extensions, but they ship as
example code that depends on a TUI host and the `~/.pi/agent/` directory
convention — neither of which fits Bunny's headless / streaming model.

## Changes

Ported four pi-mono extensions into `packages/runner-pi/src/extensions/` and
adapted them for headless use. All four are registered by default; callers
filter visibility through `allowedTools` as they already do for other tools.

- **todo** (`extensions/todo.ts`). Thin port of the upstream example: one
  tool with `list` / `add` / `toggle` / `clear` actions whose state is
  rebuilt from session entries on `session_start` / `session_tree`, so
  resumed and forked sessions see the correct todos automatically. Dropped
  the upstream `/todos` slash command and its TUI overlay since Bunny has
  no terminal renderer.

- **plan-mode** (`extensions/plan-mode/`). Read-only exploration mode,
  toggled via `--plan` flag or `/plan` command. While active, the active
  tool whitelist is restricted to `read`/`bash`/`grep`/`find`/`ls`/
  `ask_user_question`, and a regex allowlist (lifted verbatim from
  `examples/extensions/plan-mode/utils.ts`) blocks destructive bash
  invocations. The agent is prompted to end its plan with an
  ask_user_question Execute/Refine choice; an "Execute" answer queues the
  transition for `agent_end`, which then leaves plan mode and dispatches a
  fresh user message with `triggerTurn:true` so the new turn picks up the
  `[EXECUTING PLAN]` system prompt. The original three-button TUI dialog,
  status footer, widget, and `Ctrl+Alt+P` shortcut are removed; equivalent
  affordances live in custom `display:true` messages the host renders.

- **goal** (`extensions/goal/`). Headless port of pi-goal v2
  (https://github.com/PurpleMyst/pi-goal). Preserves the state machine
  (`idle` / `ready` / `paused`), the session-entry persistence model
  (custom entries with `customType: "pi-goal"`), the NO_TOOL_CALLS
  safety pause, and the `setTimeout(0)` deferral that keeps the
  continuation message attached to the next turn. `ctx.ui.notify` becomes
  a `pi-goal-info` custom message; `ctx.ui.confirm`'s overwrite prompt
  always returns false (callers must `/goal clear` before setting a new
  goal). Switched the schema runtime from `typebox` to `@sinclair/typebox`
  to match the rest of runner-pi.

- **subagent** (`extensions/subagent/`). Port of the 1009-line upstream
  example. Spawns `pi --mode json -p --no-session` for each invocation
  with the `worker` / `scout` / `planner` / `reviewer` agents bundled
  inside the package (no symlink dance required). `getPiInvocation`
  resolves the CLI via `import.meta.resolve("@earendil-works/pi-coding-agent")`
  rather than relying on `process.argv[1]`, so the parent process can be
  launched from anywhere. Child env merges `options.env` with
  `process.env` so daemon-supplied API keys reach the spawned runtime.
  Project-scope agent loading still works (`.bunny/agents` or `.pi/agents`,
  walking up from cwd) but skips the bundled defaults to avoid mixing
  trusted and untrusted prompts. The TUI `renderCall` / `renderResult`
  paths are dropped; `details` carries the same SubagentDetails shape the
  upstream UI uses, so Bunny's frontend can render it however it likes.

Plumbing:

- `BunnyAgentResourceLoader` accepts `extensionFactories` and
  `additionalExtensionPaths`, threading them into `DefaultResourceLoader`.
- `pi-runner.ts` wires the four factories unconditionally and always
  builds a resource loader; `subagentExtension({ childEnv: options.env })`
  is a factory-of-factories so child processes see the same secrets.
- `package.json` gains a `copy-assets` build step that ships
  `src/extensions/subagent/{agents,prompts}/*.md` into `dist/`.
- `apps/runner-cli` help text and `apps/daemon/README.md` document the
  new tool names available through `allowedTools`.
- `apps/web/app/api/ai/route.ts` adds `todo`, `get_goal`, `update_goal`,
  `subagent` to the demo `allowedTools` list so the bundled example
  surfaces them to the model.

A `pnpm --filter @bunny-agent/runner-pi smoke` script exercises the parts
that don't need API keys: bundled markdown reaches `dist/`, the agents
loader parses it, `getPiInvocation` resolves to the installed CLI, and a
`pi --version` spawn reports the expected version. Caught one bug pre-merge:
the original resolver hit `require.resolve` from an ESM entry point and
threw `ERR_AMBIGUOUS_MODULE_SYNTAX`; switched to `import.meta.resolve`
and a `file://` URL normalizer.

## Verification

- `pnpm --filter @bunny-agent/runner-pi typecheck`
- `pnpm --filter @bunny-agent/runner-pi build`
- `pnpm --filter @bunny-agent/runner-pi test` (258 tests across 17 files)
- `pnpm --filter @bunny-agent/runner-pi smoke`

## Files Changed

New:
- `packages/runner-pi/src/extensions/todo.ts`
- `packages/runner-pi/src/extensions/plan-mode/{index.ts,utils.ts}`
- `packages/runner-pi/src/extensions/goal/{index.ts,state.ts,state-machine.ts,goal-finder.ts,prompts.ts}`
- `packages/runner-pi/src/extensions/subagent/{index.ts,agents-loader.ts,agents/*.md,prompts/*.md}`
- `packages/runner-pi/src/__tests__/{todo-extension,plan-mode-utils,plan-mode-extension,goal-state-machine,goal-extension,subagent-agents-loader,subagent-extension}.test.ts`
- `packages/runner-pi/src/__tests__/fake-extension-api.ts`
- `packages/runner-pi/scripts/smoke.mjs`

Modified:
- `packages/runner-pi/src/pi-runner.ts`
- `packages/runner-pi/src/bunny-agent-resource-loader.ts`
- `packages/runner-pi/package.json`
- `apps/runner-cli/src/cli.ts`
- `apps/daemon/README.md`
- `apps/web/app/api/ai/route.ts`
