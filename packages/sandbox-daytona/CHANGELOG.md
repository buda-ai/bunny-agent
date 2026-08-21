# @bunny-agent/sandbox-daytona

## 0.10.0

### Minor Changes

- 8656309: Serve runners over the Agent Client Protocol (ACP) alongside the existing AI SDK UI stream, so ACP clients (Zed, JetBrains, and the Neovim/Emacs/VS Code plugins) can drive any BunnyAgent runner.

  - `POST /api/coding/acp` on the daemon — ACP over Streamable HTTP, mounted next to the unchanged `/api/coding/run`.
  - `bunny-agent acp` on the CLI — a long-lived ACP agent over stdio, the transport editors use when they spawn an agent binary. Separate from the one-shot `bunny-agent run`.
  - Runner/model selection uses ACP's protocol-defined `_meta` extension namespaced under `"bunny-agent"`, falling back to the server's configured defaults.
  - Hosted clients can pass structured turn input, environment variables, allowed tools, HTTP/module tool references, MCP configuration, skills, resume/fork state, reasoning effort, and question timeout through the same namespaced metadata.
  - Prompt responses report runner session ID and token usage metadata for persistence and billing.
  - Streamable HTTP routing supports `POST`, `GET`, and `DELETE`, including transport and explicit `session/cancel` cancellation.

  Both protocols are backed by dedicated internal packages (`server-acp`, `server-ai-sdk`) implementing a shared `CodingRunServer` contract, both consuming the same `RunnerChunk` stream — so every runner is available on both. `/api/coding/run`'s wire contract is unchanged.

  Also fixes `bunny-agent run` writing dotenv's startup tips to stdout, which carries the protocol stream.

### Patch Changes

- Updated dependencies [8656309]
  - @bunny-agent/manager@0.10.0

## 0.9.29-beta.14

### Patch Changes

- test error
  - @bunny-agent/manager@0.9.29-beta.14

## 0.9.27-beta.0

### Patch Changes

- @bunny-agent/manager@0.9.27-beta.0

## 0.9.26-beta.0

### Patch Changes

- @bunny-agent/manager@0.9.26-beta.0

## 0.9.19-beta.5

### Patch Changes

- @bunny-agent/manager@0.9.19-beta.5

## 0.9.19-beta.4

### Patch Changes

- @bunny-agent/manager@0.9.19-beta.4

## 0.9.19-beta.3

### Patch Changes

- @bunny-agent/manager@0.9.19-beta.3

## 0.9.19-beta.2

### Patch Changes

- @bunny-agent/manager@0.9.19-beta.2

## 0.9.16-beta.5

### Patch Changes

- @bunny-agent/manager@0.9.16-beta.5

## 0.9.16-beta.4

### Patch Changes

- @bunny-agent/manager@0.9.16-beta.4

## 0.9.16-beta.3

### Patch Changes

- @bunny-agent/manager@0.9.16-beta.3

## 0.9.16-beta.2

### Patch Changes

- @bunny-agent/manager@0.9.16-beta.2

## 0.9.16-beta.1

### Patch Changes

- @bunny-agent/manager@0.9.16-beta.1

## 0.9.16-beta.0

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.9.16-beta.0

## 0.9.12

### Patch Changes

- Release v0.9.12
- Updated dependencies
  - @bunny-agent/manager@0.9.12

## 0.9.11

### Patch Changes

- Release v0.9.12
- Updated dependencies
  - @bunny-agent/manager@0.9.11

## 0.9.10

### Patch Changes

- Stable release; align fixed-group packages at `0.9.10`.
- Updated dependencies
  - @bunny-agent/manager@0.9.10

## 0.9.9-beta.3

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.9.9-beta.3

## 0.9.9-beta.2

### Patch Changes

- @bunny-agent/manager@0.9.9-beta.2

## 0.9.9-beta.1

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.9.9-beta.1

## 0.9.9-beta.0

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.9.9-beta.0

## 0.9.9

### Patch Changes

- Release v0.9.10
- Updated dependencies
  - @bunny-agent/manager@0.9.9

## 0.9.8

### Patch Changes

- Release v0.9.8
- Updated dependencies
  - @bunny-agent/manager@0.9.8

## 0.9.7

### Patch Changes

- Release v0.9.7
- Updated dependencies
  - @bunny-agent/manager@0.9.7

## 0.9.6

### Patch Changes

- Release v0.9.6
- Updated dependencies
  - @bunny-agent/manager@0.9.6

## 0.9.5

### Patch Changes

- Release v0.9.5
- Updated dependencies
  - @bunny-agent/manager@0.9.5

## 0.9.4

### Patch Changes

- Release v0.9.4
- Updated dependencies
  - @bunny-agent/manager@0.9.4

## 0.9.3

### Patch Changes

- Release v0.9.3
- Updated dependencies
  - @bunny-agent/manager@0.9.3

## 0.9.2

### Patch Changes

- Release v0.9.2
- Updated dependencies
  - @bunny-agent/manager@0.9.2

## 0.9.1

### Patch Changes

- Release v0.9.1
- Updated dependencies
  - @bunny-agent/manager@0.9.1

## 0.8.10

### Patch Changes

- Release v0.9.0
- Updated dependencies
  - @bunny-agent/manager@0.8.10

## 0.8.9

### Patch Changes

- Release v0.8.9
- Updated dependencies
  - @bunny-agent/manager@0.8.9

## 0.8.8

### Patch Changes

- Release v0.8.8
- Updated dependencies
  - @bunny-agent/manager@0.8.8

## 0.8.7

### Patch Changes

- Release v0.8.7
- Updated dependencies
  - @bunny-agent/manager@0.8.7

## 0.8.6

### Patch Changes

- Release v0.8.6
- Updated dependencies
  - @bunny-agent/manager@0.8.6

## 0.8.5

### Patch Changes

- Release v0.8.5
- Updated dependencies
  - @bunny-agent/manager@0.8.5

## 0.8.4

### Patch Changes

- Release v0.8.4
- Updated dependencies
  - @bunny-agent/manager@0.8.4

## 0.8.3

### Patch Changes

- Release v0.8.3
- Updated dependencies
  - @bunny-agent/manager@0.8.3

## 0.8.2

### Patch Changes

- Release v0.8.2
- Updated dependencies
  - @bunny-agent/manager@0.8.2

## 0.8.1

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.8.1

## 0.8.0

### Minor Changes

- Release coordinated package updates as `0.8.0`.

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.8.0

## 0.7.6

### Patch Changes

- @bunny-agent/manager@0.7.6

## 0.7.5

### Patch Changes

- Prepare coordinated release update toward `0.7.5`.
- Updated dependencies
  - @bunny-agent/manager@0.7.5

## 0.7.2

### Patch Changes

- Prepare patch release `0.7.2`.
- Updated dependencies
  - @bunny-agent/manager@0.7.2

## 0.7.1

### Patch Changes

- Prepare stable patch release `0.7.1`.
- Updated dependencies
  - @bunny-agent/manager@0.7.1

## 0.7.0

### Minor Changes

- Add SDK support for explicit `systemPrompt` provider settings and release coordinated package updates.

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.7.0

## 0.6.3

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.6.3

## 0.6.2

### Patch Changes

- Version bump to 0.6.2
- Updated dependencies
  - @bunny-agent/manager@0.6.2

## 0.6.0

### Patch Changes

- Updated dependencies
- Updated dependencies [5086df7]
  - @bunny-agent/manager@0.6.0

## 0.2.21

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.2.20

## 0.2.19

### Patch Changes

- @bunny-agent/manager@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.2.17

## 0.2.16

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.2.16

## 0.2.15

### Patch Changes

- fix: only attach to RUNNING sandboxes in tryAttachExisting, skip start call
- Updated dependencies
  - @bunny-agent/manager@0.2.15

## 0.2.14

### Patch Changes

- Fix sandbox reattach volumes, stream auth errors to frontend, add sandbox ID caching (30-min TTL), add maxLifetimeSeconds option, incremental debug tracing, upgrade sandock to 2.2.4.
- Updated dependencies
  - @bunny-agent/manager@0.2.14

## 0.2.13

### Patch Changes

- Fix sandbox reattach volumes, stream auth errors to frontend, add sandbox ID caching with 30-min TTL, update reuse docs.
- Updated dependencies
  - @bunny-agent/manager@0.2.13

## 0.2.12

### Patch Changes

- refactor: unify sandboxId and volumes on SandboxHandle interface; add getSandboxId() and getVolumes() to all sandbox adapters (sandock, daytona, e2b, local); support attaching to existing sandbox by id in SandockSandbox; add Volume type to manager; add extraBody option to useAskUserQuestion; change runner-cli install from @beta to @latest
- Updated dependencies
  - @bunny-agent/manager@0.2.12

## 0.2.11

### Patch Changes

- - Fix: update changeset ignore list (use @bunny-agent/web instead of removed @bunny-agent/example)
- Updated dependencies
  - @bunny-agent/manager@0.2.11

## 0.2.10

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.2.10

## 0.2.9

### Patch Changes

- question handler
- Updated dependencies
  - @bunny-agent/manager@0.2.9

## 0.2.8

### Patch Changes

- add detail quickstart
- Updated dependencies
  - @bunny-agent/manager@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.2.7

## 0.2.5

### Patch Changes

- AskUserQuestion refactor: submitAnswer API, /api/answer route, docs reorg (quick start + approval file).
- Updated dependencies
  - @bunny-agent/manager@0.2.5

## 0.2.4

### Patch Changes

- refactor provider
- Updated dependencies
  - @bunny-agent/manager@0.2.4

## 0.2.3

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.2.3

## 0.2.2

### Patch Changes

- 3a602d4: local-sandbox change
- Updated dependencies [3a602d4]
  - @bunny-agent/manager@0.2.2

## 0.2.1

### Patch Changes

- Fix sandbox isolation and workdir handling
- Updated dependencies
  - @bunny-agent/manager@0.2.1

## 0.2.1-beta.0

### Patch Changes

- Updated dependencies
  - @bunny-agent/manager@0.2.1-beta.0

## 0.2.0

### Patch Changes

- @bunny-agent/manager@0.2.0

## 0.2.0-beta.5

### Patch Changes

- Merge @bunny-agent/ai-provider into @bunny-agent/sdk

  - **BREAKING**: `@bunny-agent/ai-provider` is now deprecated, use `@bunny-agent/sdk` instead
  - SDK now exports AI Provider (`createBunnyAgent`) and React hooks (`useBunnyAgentChat`)
  - SDK re-exports `LocalSandbox` for convenience
  - Updated all documentation to use `@bunny-agent/sdk`

- Updated dependencies
  - @bunny-agent/manager@0.2.0-beta.5

## 0.1.2-beta.4

### Patch Changes

- @bunny-agent/manager@0.1.2-beta.4

## 0.1.2-beta.3

### Patch Changes

- 56ff91a: - Merge sandbox-local package into @bunny-agent/manager as built-in LocalSandbox
  - Remove unused agentTemplate option from all sandbox adapters (E2B, Sandock, Daytona)
  - Fix kui component exports
- Updated dependencies [56ff91a]
  - @bunny-agent/manager@0.1.2-beta.3
