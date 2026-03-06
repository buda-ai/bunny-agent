# @sandagent/runner-cli

## 0.2.21

### Patch Changes

- - fix: thinking part convert

## 0.2.20

### Patch Changes

- - fix: Claude CLI rejects `--dangerously-skip-permissions` when running as root (uid 0) in containers, causing silent `exit code 1`. Now auto-detects root and falls back to `permissionMode: "default"` with `canUseTool` callback for tool approval.

## 0.2.19

### Patch Changes

- In the container, sandagent run --model gemini-3.1-pro ... failed with [AISDKStream] Error: Claude Code process exited with code 1. The stream only showed this generic message and

## 0.2.18

### Patch Changes

- chore: upgrade AI SDK, set turbopack.root, bump SDK provider deps
- docs: add Troubleshooting for "Claude Code process exited with code 1" in container (DEBUG, API/model, network); add hint in runner-claude stream when process exits
- fix: improve error handling in runner-claude — log stack/cause when DEBUG=true, avoid masking API errors (e.g. invalid model name) with generic exit message

## 0.2.17

### Patch Changes

- add space id to Volume

## 0.2.16

### Patch Changes

- Use Claude via LiteLLM proxy (including Bedrock pass-through). Configure LITELLM_MASTER_KEY, ANTHROPIC_BEDROCK_BASE_URL, CLAUDE_CODE_USE_BEDROCK, etc., for self-hosted gateways or Bedrock.

## 0.2.15

### Patch Changes

- fix: only attach to RUNNING sandboxes in tryAttachExisting, skip start call

## 0.2.14

### Patch Changes

- Fix sandbox reattach volumes, stream auth errors to frontend, add sandbox ID caching (30-min TTL), add maxLifetimeSeconds option, incremental debug tracing, upgrade sandock to 2.2.4.

## 0.2.13

### Patch Changes

- Fix sandbox reattach volumes, stream auth errors to frontend, add sandbox ID caching with 30-min TTL, update reuse docs.

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
