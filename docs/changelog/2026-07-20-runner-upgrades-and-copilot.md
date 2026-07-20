# Runner upgrades and Copilot integration

## Scope

- Upgrade the Claude Agent SDK and Codex SDK to their latest stable patch releases.
- Upgrade the Pi packages and rebase the Bunny-specific package patch.
- Migrate the Gemini and OpenCode ACP dependency to the stable 1.x SDK API.
- Add a first-class GitHub Copilot runner and wire it through the shared harness and runner CLI.

## Progress

- Audited the current runner implementations, package versions, patch files, and test coverage.
- Confirmed that Gemini and OpenCode currently implement ACP manually despite declaring the ACP SDK dependency.
- Confirmed that the Copilot dispatch branch is currently an unimplemented placeholder.
- Upgraded `@anthropic-ai/claude-agent-sdk` from 0.3.211 to 0.3.215 and `@anthropic-ai/sdk` from 0.111.0 to 0.112.3.
- Upgraded `@openai/codex-sdk` from 0.144.5 to 0.144.6.
- Upgraded the Pi package family from 0.80.7 to 0.80.10 and aligned the standalone Bunny TUI from 0.74.0 to 0.80.10.
- Regenerated the Bunny-specific Pi patch against 0.80.10 with pnpm's patch workflow.
- Migrated the Pi runner from the removed `ModelRegistry.inMemory()` API to the new asynchronous `ModelRuntime` API.
- Verified the Claude runner typecheck and all 49 tests, plus the Codex runner typecheck and all 5 tests.
- Replaced the duplicate handwritten Gemini and OpenCode JSON-RPC loops with a shared ACP 1.2.1 runtime.
- Added typed ACP session initialization, incremental text and reasoning, tool events, usage metadata, session IDs, file-based permissions, abort handling, and complete error streams.
- Added `@bunny-agent/runner-copilot` on `@github/copilot-sdk` 1.0.7 with create/resume support, system messages, tool filters, reasoning effort, permission handling, streaming events, usage metadata, and cancellation.
- Wired Copilot through `runner-harness` and the runner CLI bundle, and documented GitHub token and logged-in-user authentication.
- Raised the Node.js minimum to 20.19 because that is required by the Copilot SDK.
- Added focused ACP, Gemini, OpenCode, Copilot, and harness dispatch tests; ACP and Copilot package checks are green.
- Verified that the installed Copilot SDK can start its bundled CLI runtime, report CLI version 1.0.71, detect the logged-in user, and stop cleanly without making a model request.

## Verification

- `pnpm run -w lint`
- `pnpm build`
- `pnpm -r typecheck`
- `pnpm test`
- `pnpm install --frozen-lockfile`
- Focused ACP, Claude, Codex, Copilot, Gemini, OpenCode, Pi, harness, and runner CLI tests
