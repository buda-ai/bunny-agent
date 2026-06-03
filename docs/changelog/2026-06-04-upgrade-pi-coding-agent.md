# Upgrade Pi Coding Agent

## Changes

- Upgraded the Pi runtime dependencies from `0.74.0` to `0.78.0`.
- Migrated the Bunny-specific `@earendil-works/pi-coding-agent` patch to `0.78.0` so Pi continues to use `.bunny` as its config directory.
- Reviewed upstream Pi extension examples for candidates that could be bundled or adapted in Bunny Agent.
- Added shared Bunny Pi safety gates with `/yolo true|false`, `/permissions safe|yolo|status`, and `--permission safe|yolo`.
- Bundled Pi's upstream plan-mode and subagent extensions into `@bunny-agent/runner-pi` so both Bunny TUI and daemon-backed Pi runs can use them.
- Bundled a Bunny-adapted port of `code-yeongyu/pi-goal`, including `/goal` and the `create_goal`, `update_goal`, and `get_goal` tools.
- Added `/subagent` helper command plus bundled `scout`, `planner`, `reviewer`, and `worker` agents with `/implement`, `/implement-and-review`, and `/scout-and-plan` prompt workflows.
- Documented bundled extension provenance in `packages/runner-pi/src/bundled-extensions/README.md`.
- Simplified bundled extension packaging by defining default subagents and workflow commands in TypeScript, removing the `copy-bundled-assets` build step.
- Added Bunny `effort` plumbing through SDK, daemon, runner CLI, and manager command construction, mapping it to Pi's native `thinkingLevel`.
- Added opt-in AI integration tests for the Pi runner and daemon-to-Pi path, guarded by `RUN_AI_INTEGRATION=1`, with README instructions for loading local API credentials.
- Adjusted the daemon git RPC property test to compare JSON wire-format options, avoiding a `-0` round-trip flake.
- Added Vitest's V8 coverage provider so the Pi runner and daemon test suites can generate coverage reports.
- Added focused coverage tests and 80% global coverage thresholds for the Pi runner core and daemon suites.
- Added Pi runner and daemon coverage checks to CI, with optional real-model coverage when CI API-key secrets are present.
- Required `OPENAI_BASE_URL` alongside `OPENAI_API_KEY` for the default `openai:gpt-5.4` AI integration coverage path.
- Added manual CI dispatch and moved AI integration secret checks into the workflow shell step so missing secrets skip only the real-model coverage pass.
- Updated GitHub Actions and the root Node engine to `>=22.19.0`, matching `undici@8.3.0` from the Pi/OpenAI dependency chain.

## Extension Candidates

- `permission-gate.ts`: useful for local TUI safety when running risky shell commands.
- `protected-paths.ts`: useful as a default guard for secrets, `.git`, dependency folders, and generated build output.
- `tools.ts`: useful for interactive tool allowlist management in the Bunny TUI.
- `plan-mode/`: useful for an explicit read-only planning mode before write-capable implementation.
- `preset.ts`: useful for named Bunny task modes that bundle model, tools, and instructions.
- `subagent/`: strategically aligned with Bunny Agent's Super Agent direction, but should be adapted carefully because it creates nested agent workflows.
- `git-checkpoint.ts`: useful for local restore points, but should be optional because it changes git state.
- `notify.ts` and `status-line.ts`: useful low-risk TUI quality-of-life extensions.

## Notes

- Game/demo/UI stress-test extensions such as `snake.ts`, `space-invaders.ts`, `tic-tac-toe.ts`, and `doom-overlay/` are good API examples but are not strong candidates for Bunny Agent defaults.
- Provider examples such as `custom-provider-anthropic/` and `custom-provider-gitlab-duo/` are better treated as references unless Bunny Agent needs those provider integrations directly.
