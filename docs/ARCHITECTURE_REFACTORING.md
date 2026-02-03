# Architecture Refactoring Notes

This document summarizes the architecture refactor that split responsibilities between a small core manager, sandbox adapters, and runner implementations.

## Before vs After (Summary)

### Before

- `@sandagent/core` mixed lifecycle management and interface definitions
- Runners were isolated and hard to swap
- `sdk` was thin and overlapped with `ai-provider`

### After

- `@sandagent/manager` defines the core interfaces and lifecycle
- `runner-*` and `sandbox-*` implement interfaces independently
- `ai-provider` composes a manager with a runner + sandbox
- `sdk` functionality is merged into `ai-provider`

## Current Package Roles

- `packages/manager`: defines `Runner` and `SandboxAdapter`, manages sessions
- `packages/runner-claude`: Claude-based runner implementation
- `packages/sandbox-*`: sandbox adapters (local, e2b, sandock, daytona)
- `packages/ai-provider`: AI SDK provider integration

## Why This Helps

- Clear separation of responsibilities
- Pluggable runners and sandboxes
- No circular dependencies
- Easier testing and extension

## Related Docs

- `docs/REFACTORING_COMPLETION_SUMMARY.md`
- `spec/SANDBOX_ADAPTERS.md`
