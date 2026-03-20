# @sandagent/sandbox-e2b

## 0.8.9

### Patch Changes

- Release v0.8.9
- Updated dependencies
  - @sandagent/manager@0.8.9

## 0.8.8

### Patch Changes

- Release v0.8.8
- Updated dependencies
  - @sandagent/manager@0.8.8

## 0.8.7

### Patch Changes

- Release v0.8.7
- Updated dependencies
  - @sandagent/manager@0.8.7

## 0.8.6

### Patch Changes

- Release v0.8.6
- Updated dependencies
  - @sandagent/manager@0.8.6

## 0.8.5

### Patch Changes

- Release v0.8.5
- Updated dependencies
  - @sandagent/manager@0.8.5

## 0.8.4

### Patch Changes

- Release v0.8.4
- Updated dependencies
  - @sandagent/manager@0.8.4

## 0.8.3

### Patch Changes

- Release v0.8.3
- Updated dependencies
  - @sandagent/manager@0.8.3

## 0.8.2

### Patch Changes

- Release v0.8.2
- Updated dependencies
  - @sandagent/manager@0.8.2

## 0.8.1

### Patch Changes

- Updated dependencies
  - @sandagent/manager@0.8.1

## 0.8.0

### Minor Changes

- Release coordinated package updates as `0.8.0`.

### Patch Changes

- Updated dependencies
  - @sandagent/manager@0.8.0

## 0.7.6

### Patch Changes

- @sandagent/manager@0.7.6

## 0.7.5

### Patch Changes

- Prepare coordinated release update toward `0.7.5`.
- Updated dependencies
  - @sandagent/manager@0.7.5

## 0.7.2

### Patch Changes

- Prepare patch release `0.7.2`.
- Updated dependencies
  - @sandagent/manager@0.7.2

## 0.7.1

### Patch Changes

- Prepare stable patch release `0.7.1`.
- Updated dependencies
  - @sandagent/manager@0.7.1

## 0.7.0

### Minor Changes

- Add SDK support for explicit `systemPrompt` provider settings and release coordinated package updates.

### Patch Changes

- Updated dependencies
  - @sandagent/manager@0.7.0

## 0.6.3

### Patch Changes

- Updated dependencies
  - @sandagent/manager@0.6.3

## 0.6.2

### Patch Changes

- Version bump to 0.6.2
- Updated dependencies
  - @sandagent/manager@0.6.2

## 0.6.0

### Patch Changes

- Updated dependencies
- Updated dependencies [5086df7]
  - @sandagent/manager@0.6.0

## 0.2.21

### Patch Changes

- Updated dependencies
  - @sandagent/manager@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies
  - @sandagent/manager@0.2.20

## 0.2.19

### Patch Changes

- @sandagent/manager@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies
  - @sandagent/manager@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies
  - @sandagent/manager@0.2.17

## 0.2.16

### Patch Changes

- Updated dependencies
  - @sandagent/manager@0.2.16

## 0.2.15

### Patch Changes

- fix: only attach to RUNNING sandboxes in tryAttachExisting, skip start call
- Updated dependencies
  - @sandagent/manager@0.2.15

## 0.2.14

### Patch Changes

- Fix sandbox reattach volumes, stream auth errors to frontend, add sandbox ID caching (30-min TTL), add maxLifetimeSeconds option, incremental debug tracing, upgrade sandock to 2.2.4.
- Updated dependencies
  - @sandagent/manager@0.2.14

## 0.2.13

### Patch Changes

- Fix sandbox reattach volumes, stream auth errors to frontend, add sandbox ID caching with 30-min TTL, update reuse docs.
- Updated dependencies
  - @sandagent/manager@0.2.13

## 0.2.12

### Patch Changes

- refactor: unify sandboxId and volumes on SandboxHandle interface; add getSandboxId() and getVolumes() to all sandbox adapters (sandock, daytona, e2b, local); support attaching to existing sandbox by id in SandockSandbox; add Volume type to manager; add extraBody option to useAskUserQuestion; change runner-cli install from @beta to @latest
- Updated dependencies
  - @sandagent/manager@0.2.12

## 0.2.11

### Patch Changes

- - Fix: update changeset ignore list (use @sandagent/web instead of removed @sandagent/example)
- Updated dependencies
  - @sandagent/manager@0.2.11

## 0.2.10

### Patch Changes

- Updated dependencies
  - @sandagent/manager@0.2.10

## 0.2.9

### Patch Changes

- question handler
- Updated dependencies
  - @sandagent/manager@0.2.9

## 0.2.8

### Patch Changes

- add detail quickstart
- Updated dependencies
  - @sandagent/manager@0.2.8

## 0.2.7

### Patch Changes

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

- Updated dependencies
  - @sandagent/manager@0.2.1-beta.0

## 0.2.0

### Patch Changes

- @sandagent/manager@0.2.0

## 0.2.0-beta.5

### Patch Changes

- Merge @sandagent/ai-provider into @sandagent/sdk

  - **BREAKING**: `@sandagent/ai-provider` is now deprecated, use `@sandagent/sdk` instead
  - SDK now exports AI Provider (`createSandAgent`) and React hooks (`useSandAgentChat`)
  - SDK re-exports `LocalSandbox` for convenience
  - Updated all documentation to use `@sandagent/sdk`

- Updated dependencies
  - @sandagent/manager@0.2.0-beta.5

## 0.1.2-beta.4

### Patch Changes

- @sandagent/manager@0.1.2-beta.4

## 0.1.2-beta.3

### Patch Changes

- 56ff91a: - Merge sandbox-local package into @sandagent/manager as built-in LocalSandbox
  - Remove unused agentTemplate option from all sandbox adapters (E2B, Sandock, Daytona)
  - Fix kui component exports
- Updated dependencies [56ff91a]
  - @sandagent/manager@0.1.2-beta.3
