# ACP Runtime Metadata

## Summary

- Extended the BunnyAgent ACP server metadata contract so hosted products can pass structured turn input, dynamic environment variables, runner session state, skills, MCP configuration, tool references, reasoning effort, and allowed tools without routing through an AI SDK language-model adapter.
- Added runner session ID and token usage metadata to ACP prompt responses.
- Routed Streamable HTTP `GET` and `DELETE` through both standalone and Next.js daemon adapters so clients can receive server events and close connections cleanly.
- Propagated transport disconnects and explicit `session/cancel` notifications to the active runner.
- Added regression coverage for Buda-style session and per-turn overrides.

## Why

Hosted products need the ACP transport to preserve the same runner configuration available through `/api/coding/run`. The previous ACP surface only accepted runner, model, system prompt, and yolo mode, which made direct ACP integration lose session recovery, product tools, MCP servers, dynamic credentials, and usage accounting.

## Validation

- `pnpm --filter @bunny-agent/server-acp test`
- `pnpm --filter @bunny-agent/daemon test`
- Linting and type checking were intentionally skipped for pull request delivery.
