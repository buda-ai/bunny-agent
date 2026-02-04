# @sandagent/sdk

## 0.2.7

### Patch Changes

- add readme
- Updated dependencies
  - @sandagent/manager@0.2.7

## 0.2.5

### Patch Changes

- AskUserQuestion refactor: submitAnswer API, /api/answer route, docs reorg (quick start + approval file).
- Updated dependencies
  - @sandagent/manager@0.2.5

## 0.2.4

### Patch Changes

- refactor provider
- Updated dependencies
  - @sandagent/manager@0.2.4

## 0.2.3

### Patch Changes

- refactor runner
- Updated dependencies
  - @sandagent/manager@0.2.3

## 0.2.2

### Patch Changes

- 3a602d4: local-sandbox change
- Updated dependencies [3a602d4]
  - @sandagent/manager@0.2.2

## 0.2.1

### Patch Changes

- Fix sandbox isolation and workdir handling
- Updated dependencies
  - @sandagent/manager@0.2.1

## 0.2.1-beta.0

### Patch Changes

- Unified release with fixes

  - LocalSandbox: Auto-copy .claude and CLAUDE.md to isolated directory
  - runner-claude: Fix abort handler cleanup to prevent memory leaks
  - runner-claude: Write debug files to cwd instead of process.cwd()
  - runner-cli: Add @anthropic-ai/claude-agent-sdk as dependency for npx usage

- Updated dependencies
  - @sandagent/manager@0.2.1-beta.0

## 0.2.0

### Patch Changes

- @sandagent/manager@0.2.0

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
