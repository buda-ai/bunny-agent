# Pluggable output protocols: `server-ai-sdk` + `server-acp`

Runner output is now served through swappable protocol server packages instead
of being hardcoded to the AI SDK UI stream. BunnyAgent can now act as an
**Agent Client Protocol (ACP) agent**, so ACP clients (Zed, JetBrains, and the
Neovim/Emacs/VS Code plugins) can drive any BunnyAgent runner.

## Added

- **`packages/server-acp`** — serves runners as an ACP agent.
  - `session-update-serializer.ts` — `AcpSessionUpdateSerializer` maps
    `RunnerChunk`s to ACP `session/update` payloads. This is the inverse of the
    existing mapping in `runner-acp/src/process-runner.ts` (`handleUpdate`),
    which translates ACP updates into AI SDK chunks for ACP-backed runners.
  - `acp-agent.ts` — `createBunnyAgentAcpApp()`, transport-agnostic: handles
    `initialize`, `session/new`, `session/prompt`, `session/cancel`.
  - `http-server.ts` — `createAcpHttpServer()` for the daemon, over Streamable
    HTTP.
  - `stdio-server.ts` — `runAcpOverStdio()` for the CLI, the transport editors
    use when spawning an agent binary.
- **`packages/server-ai-sdk`** — the existing AI SDK UI stream protocol,
  extracted from `apps/daemon/src/routes/coding.ts`. The Node and Web adapters
  now share one `codingRunChunks()` core instead of duplicating validation,
  heartbeat, `createRunner` wiring, and the SSE error envelope.
- **`CodingRunServer`** interface in `runner-harness` — the shared contract both
  protocol servers implement (`handleNodeHttp` / `handleWebRequest`).
- **`bunny-agent acp`** CLI subcommand — a long-lived ACP agent over stdio,
  separate from the one-shot `bunny-agent run`.

## Changed

- `apps/daemon` mounts protocol servers from a list rather than branching per
  route; `/api/coding/acp` is served alongside the existing `/api/coding/run`.
  Both the standalone (`server.ts`) and Next.js (`nextjs.ts`) entry points use
  the same composition.
- `apps/daemon/src/routes/coding.ts` removed — its logic lives in
  `server-ai-sdk`.

## Notes

- `/api/coding/run`'s wire contract is unchanged; the existing daemon test suite
  (25 tests in `apps/daemon/src/__tests__/coding.test.ts`) passes untouched as
  the regression check.
- Runner/model selection for ACP sessions uses ACP's protocol-defined `_meta`
  extension under a `bunny-agent` namespace, falling back to server defaults.
- Tool permissions: V1 runs ACP sessions under the same server-side
  `yolo`/allowlist policy used elsewhere. Forwarding approvals interactively to
  the ACP client via `session/requestPermission` is a follow-up — the
  `RunnerChunk` stream has no "pause and await permission" signal today.
