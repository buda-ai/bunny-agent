# Changelog — 2026-03-25 — RunnerSpec `kind` removed

## `packages/manager`

- Removed `RunnerSpec.kind` (it was always `"claude-agent-sdk"`). Use `runnerType`, `model`, and other fields only.

## `packages/sdk`

- Removed `getRunnerKindForModel`; `createSandAgent` no longer sets `runner.kind`.

## `apps/manager-cli`

- `sandagent run` no longer passes `kind` when constructing `SandAgent`.
