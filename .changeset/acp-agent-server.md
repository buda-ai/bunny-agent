---
"@bunny-agent/daemon": minor
"@bunny-agent/manager": minor
"@bunny-agent/runner-cli": minor
"@bunny-agent/sandbox-e2b": minor
"@bunny-agent/sandbox-local": minor
"@bunny-agent/sandbox-sandock": minor
"@bunny-agent/sandbox-srt": minor
"@bunny-agent/sandbox-daytona": minor
"@bunny-agent/sdk": minor
---

Serve runners over the Agent Client Protocol (ACP) alongside the existing AI SDK UI stream, so ACP clients (Zed, JetBrains, and the Neovim/Emacs/VS Code plugins) can drive any BunnyAgent runner.

- `POST /api/coding/acp` on the daemon — ACP over Streamable HTTP, mounted next to the unchanged `/api/coding/run`.
- `bunny-agent acp` on the CLI — a long-lived ACP agent over stdio, the transport editors use when they spawn an agent binary. Separate from the one-shot `bunny-agent run`.
- Runner/model selection uses ACP's protocol-defined `_meta` extension namespaced under `"bunny-agent"`, falling back to the server's configured defaults.

Both protocols are backed by dedicated internal packages (`server-acp`, `server-ai-sdk`) implementing a shared `CodingRunServer` contract, both consuming the same `RunnerChunk` stream — so every runner is available on both. `/api/coding/run`'s wire contract is unchanged.

Also fixes `bunny-agent run` writing dotenv's startup tips to stdout, which carries the protocol stream.
