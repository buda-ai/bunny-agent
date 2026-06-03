# Bunny Pi Bundled Extensions

This directory contains the shared Pi extension pack loaded by `@bunny-agent/runner-pi`.
It is used by both the Bunny TUI and daemon-backed Pi runs through `BunnyAgentResourceLoader`.

## Sources

- `plan-mode/`: adapted from `packages/coding-agent/examples/extensions/plan-mode/` in `earendil-works/pi` at the time Bunny upgraded Pi to `0.78.0`.
- `subagent/`: adapted from `packages/coding-agent/examples/extensions/subagent/` in `earendil-works/pi` at the time Bunny upgraded Pi to `0.78.0`.
- `goal/`: adapted from `code-yeongyu/pi-goal` (`pi-goal` npm package style extension), with imports and storage defaults adjusted for Bunny's `@earendil-works/*` Pi packages and `.bunny` config directory.
- `safety.ts`: Bunny-specific extension built from the same Pi extension API patterns as upstream `permission-gate.ts` and `protected-paths.ts`.

## Bunny Adaptations

- Shared loading: the extension pack lives in `packages/runner-pi` so TUI, runner-cli, SDK, and daemon paths can use the same behavior.
- Config paths: project-local subagents use `.bunny/agents`; user agents use Bunny's patched Pi agent directory.
- Permission mode: Bunny maps `yolo` to the shared safety extension's `permissionMode: "yolo"`.
- Subagents: child Pi processes explicitly load this shared extension pack so delegated agents inherit Bunny defaults.
- Bundled prompts and agent markdown files are copied into `dist/` by the `copy-bundled-assets` build step.

When updating vendored upstream code, keep this README current with the source repository, upstream version or commit, and any Bunny-specific patches.
