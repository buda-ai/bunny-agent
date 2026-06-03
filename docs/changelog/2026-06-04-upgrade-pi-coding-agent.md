# Upgrade Pi Coding Agent

## Changes

- Upgraded the Pi runtime dependencies from `0.74.0` to `0.78.0`.
- Migrated the Bunny-specific `@earendil-works/pi-coding-agent` patch to `0.78.0` so Pi continues to use `.bunny` as its config directory.
- Reviewed upstream Pi extension examples for candidates that could be bundled or adapted in Bunny Agent.

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
