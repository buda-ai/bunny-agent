# @bunny-agent/sandbox-local

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
