# @sandagent/runner-cli

## 0.2.12

### Patch Changes

- refactor: unify sandboxId and volumes on SandboxHandle interface; add getSandboxId() and getVolumes() to all sandbox adapters (sandock, daytona, e2b, local); support attaching to existing sandbox by id in SandockSandbox; add Volume type to manager; add extraBody option to useAskUserQuestion; change runner-cli install from @beta to @latest

## 0.2.11

### Patch Changes

- - Fix: update changeset ignore list (use @sandagent/web instead of removed @sandagent/example)

## 0.2.10

### Patch Changes

- Simplify image build CLI: remove --repo option, use --name as full image name (matching docker convention), fix Dockerfile lookup for monorepo development, rename build context to .docker-staging

## 0.2.9

### Patch Changes

- question handler

## 0.2.8

### Patch Changes

- add detail quickstart

## 0.2.7

### Patch Changes

- add readme

## 0.2.5

### Patch Changes

- AskUserQuestion refactor: submitAnswer API, /api/answer route, docs reorg (quick start + approval file).

## 0.2.4

### Patch Changes

- refactor provider

## 0.2.3

### Patch Changes

- refactor runner

## 0.2.2

### Patch Changes

- 3a602d4: local-sandbox change

## 0.2.1

### Patch Changes

- Fix sandbox isolation and workdir handling

## 0.2.1-beta.0

### Patch Changes

- Unified release with fixes

  - LocalSandbox: Auto-copy .claude and CLAUDE.md to isolated directory
  - runner-claude: Fix abort handler cleanup to prevent memory leaks
  - runner-claude: Write debug files to cwd instead of process.cwd()
  - runner-cli: Add @anthropic-ai/claude-agent-sdk as dependency for npx usage

## 0.2.0

### Patch Changes

- Add @anthropic-ai/claude-agent-sdk as dependency so npx can access it

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
