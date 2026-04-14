# Add Bunny Agent Daemon Package Scaffold

## Date: 2026-03-18

## Summary

Prepared a pull request for the initial daemon package scaffold, expanded it into a working daemon entrypoint with filesystem, git, and Next.js integration helpers, and renamed the app from `apps/bunny-agent-daemon` to `apps/daemon`.

## Changes

### `apps/bunny-agent-daemon/package.json`

- Added package metadata, build scripts, and development dependencies for the daemon app.
- Exported a `./nextjs` entry for framework integration.

### `apps/bunny-agent-daemon/tsconfig.json`

- Added a package-local TypeScript configuration extending the workspace base config.

### `apps/bunny-agent-daemon/vitest.config.ts`

- Added a package-local Vitest configuration for daemon tests.

### `apps/bunny-agent-daemon/README.md`

- Added English documentation covering the daemon architecture, API surface, runtime environment variables, and integration examples.

### `apps/bunny-agent-daemon/entrypoint.sh`

- Added a container entrypoint that starts browser debugging, an optional git sidecar, and the unified daemon process.

### `apps/bunny-agent-daemon/docs/entrypoint.example.sh`

- Added an example entrypoint script for container integration.

### `apps/bunny-agent-daemon/src/utils.ts`

- Added shared API envelope helpers, application state types, safe path resolution helpers, and directory creation utilities.

### `apps/bunny-agent-daemon/src/cli.ts`

- Added the CLI startup entrypoint for booting the daemon server from environment configuration.

### `apps/bunny-agent-daemon/src/index.ts`

- Added package exports for the daemon server, router, and shared types.
- Refined the type-only export style for shared daemon types.

### `apps/bunny-agent-daemon/src/server.ts`

- Added the HTTP server implementation that parses requests and returns JSON API envelopes.
- Extended the server flow to route the Bunny Agent streaming endpoint before standard JSON handlers.

### `apps/bunny-agent-daemon/src/router.ts`

- Added centralized route registration and error handling for health, filesystem, git, and volume endpoints.
- Tightened route handler typing and simplified route invocations.

### `apps/bunny-agent-daemon/src/nextjs.ts`

- Added a Next.js route-handler adapter that reuses the daemon router in app-router endpoints.
- Cleaned up request parsing and not-found response formatting.

### `apps/bunny-agent-daemon/src/routes/health.ts`

- Added a health route helper returning the configured root and volumes paths.

### `apps/bunny-agent-daemon/src/routes/fs.ts`

- Added filesystem list, read, stat, exists, search, write, append, mkdir, remove, move, and copy handlers with root scoping.
- Reformatted and clarified typed filesystem response handling.

### `apps/bunny-agent-daemon/src/routes/git.ts`

- Added git status, exec, clone, and init handlers with a command allowlist and tracked-file reporting.
- Hardened git execution error handling and improved type safety for command execution results.

### `apps/bunny-agent-daemon/src/routes/bunny-agent.ts`

- Updated the streaming Bunny Agent route imports to align with runner-core usage.

### `apps/bunny-agent-daemon/src/routes/volumes.ts`

- Added volume listing, creation, and removal helpers backed by the daemon state paths.
- Reformatted the volume handlers for clearer typing and flow.

### `apps/bunny-agent-daemon/src/__tests__/daemon.test.ts`

- Added end-to-end daemon tests covering health, filesystem, volume, git, and not-found routes.
- Tightened test imports and inline typing in the daemon integration coverage.

### `apps/runner-cli/src/runner.ts`

- Normalized the `runner-core` import ordering used by the CLI entrypoint.

### `packages/runner-core/src/index.ts`

- Reformatted runner construction branches for clearer parameter passing across providers.

### `docs/changelog/2026-03-18-bunny-agent-daemon-package-scaffold.md`

- Documented the session changes and PR preparation work.

### `pnpm-lock.yaml`

- Added the daemon package importer and its development dependency resolutions to the workspace lockfile.

### `apps/daemon/*`

- Renamed the daemon app directory from `apps/bunny-agent-daemon` to `apps/daemon`.
- Updated package metadata and workspace references to match the new app location.

### `apps/daemon/README.md`

- Expanded the documentation for direct `runner-core` usage without the daemon HTTP layer.
- Added detailed request and streaming response documentation for `POST /api/bunny-agent/run`.
- Updated the documented agent stream format from SSE to chunked NDJSON.

### `apps/daemon/src/routes/bunny-agent.ts`

- Switched daemon agent streaming responses to `application/x-ndjson` chunked output.
- Emitted plain NDJSON error lines instead of SSE-formatted error events.

### `apps/daemon/src/routes/coding.ts`

- Moved the agent streaming route implementation into a dedicated coding route module.
- Kept the runner-core streaming behavior while aligning the route naming with `/api/coding/run`.
- Added a web `Response` streaming helper for Next.js embedded daemon usage.

### `apps/daemon/src/server.ts`

- Renamed the daemon streaming endpoint from `/api/bunny-agent/run` to `/api/coding/run`.

### `apps/daemon/src/nextjs.ts`

- Added direct handling for `/api/coding/run` so embedded Next.js deployments can return streamed NDJSON responses.
- Fixed import ordering to satisfy Biome lint checks.
- Added configurable mount-prefix support so the embedded handler can be mounted outside the default `/api/daemon` path.

### `apps/daemon/src/__tests__/coding.test.ts`

- Added standalone and embedded streaming tests for the `/api/coding/run` route and the Next.js adapter.
- Updated the git exec negative test to assert the current unsupported-subcommand error path.
- Fixed Biome issues in the coding route tests by organizing imports, formatting assertions, and replacing the throw-only async generator mock.

### `packages/sdk/src/provider/bunny-agent-daemon-provider.ts`

- Added a daemon-backed AI SDK language model provider that calls `/api/bunny-agent/run`.
- Mapped daemon NDJSON stream messages into AI SDK `LanguageModelV3` stream parts.
- Updated the daemon transport provider to call `/api/coding/run`.
- Applied Biome formatting fixes after adding the daemon transport fetch logic.

### `apps/daemon/src/routes/coding.ts`

- Applied Biome formatting fixes to the NDJSON error streaming path.

### `packages/sdk/src/index.ts`

- Exported `createBunnyAgentDaemon` and its provider settings type from the SDK entrypoint.

### `packages/sdk/README.md`

- Documented the new daemon transport provider alongside the existing sandbox transport provider.
- Added usage examples for `createBunnyAgentDaemon` and clarified transport swapping behavior.

### `packages/manager/README.md`

- Marked the exec-based manager transport as deprecated in favor of the daemon HTTP transport for new integrations.

### `docs/ARCHITECTURE.md`

- Added a high-level architecture document covering daemon deployment modes, SDK transport options, and package dependencies.

### `apps/daemon/README.md`

- Renamed the documented agent endpoint from `/api/bunny-agent/run` to `/api/coding/run`.

### `package.json`

- Upgraded the root `@biomejs/biome` dependency to the 2.3.x line so workspace lint uses a consistent CLI/schema version.

### `biome.json`

- Migrated the root Biome configuration to the 2.3 schema and updated file include patterns to the current config format.

### Workspace Biome fixes

- Ran Biome safe fixes across the repository, normalizing import/export ordering and removing a broad set of lintable formatting issues.

### `packages/kui/src/components/ui/input-group.tsx`

- Added keyboard handling for the clickable input-group addon so it satisfies Biome accessibility lint rules.
