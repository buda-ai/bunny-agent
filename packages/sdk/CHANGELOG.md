# @sandagent/sdk

## 0.2.0-beta.5

### Minor Changes

- Merge @sandagent/ai-provider into @sandagent/sdk

  - **BREAKING**: `@sandagent/ai-provider` is now deprecated, use `@sandagent/sdk` instead
  - SDK now exports AI Provider (`createSandAgent`) and React hooks (`useSandAgentChat`)
  - SDK re-exports `LocalSandbox` for convenience
  - Updated all documentation to use `@sandagent/sdk`

### Patch Changes

- Updated dependencies
  - @sandagent/manager@0.2.0-beta.5
