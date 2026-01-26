# @sandagent/manager

## 0.2.0-beta.5

### Patch Changes

- Merge @sandagent/ai-provider into @sandagent/sdk

  - **BREAKING**: `@sandagent/ai-provider` is now deprecated, use `@sandagent/sdk` instead
  - SDK now exports AI Provider (`createSandAgent`) and React hooks (`useSandAgentChat`)
  - SDK re-exports `LocalSandbox` for convenience
  - Updated all documentation to use `@sandagent/sdk`

## 0.1.2-beta.4

## 0.1.2-beta.3

### Patch Changes

- 56ff91a: - Merge sandbox-local package into @sandagent/manager as built-in LocalSandbox
  - Remove unused agentTemplate option from all sandbox adapters (E2B, Sandock, Daytona)
  - Fix kui component exports
