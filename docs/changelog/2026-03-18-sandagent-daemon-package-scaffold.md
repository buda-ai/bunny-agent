# Add SandAgent Daemon Package Scaffold

## Date: 2026-03-18

## Summary

Prepared a pull request for the initial `apps/sandagent-daemon` package scaffold and expanded it into a working daemon entrypoint with filesystem, git, and Next.js integration helpers.

## Changes

### `apps/sandagent-daemon/package.json`

- Added package metadata, build scripts, and development dependencies for the daemon app.
- Exported a `./nextjs` entry for framework integration.

### `apps/sandagent-daemon/tsconfig.json`

- Added a package-local TypeScript configuration extending the workspace base config.

### `apps/sandagent-daemon/vitest.config.ts`

- Added a package-local Vitest configuration for daemon tests.

### `apps/sandagent-daemon/README.md`

- Added English documentation covering the daemon architecture, API surface, runtime environment variables, and integration examples.

### `apps/sandagent-daemon/entrypoint.sh`

- Added a container entrypoint that starts browser debugging, an optional git sidecar, and the unified daemon process.

### `apps/sandagent-daemon/docs/entrypoint.example.sh`

- Added an example entrypoint script for container integration.

### `apps/sandagent-daemon/src/utils.ts`

- Added shared API envelope helpers, application state types, safe path resolution helpers, and directory creation utilities.

### `apps/sandagent-daemon/src/cli.ts`

- Added the CLI startup entrypoint for booting the daemon server from environment configuration.

### `apps/sandagent-daemon/src/index.ts`

- Added package exports for the daemon server, router, and shared types.

### `apps/sandagent-daemon/src/server.ts`

- Added the HTTP server implementation that parses requests and returns JSON API envelopes.

### `apps/sandagent-daemon/src/router.ts`

- Added centralized route registration and error handling for health, filesystem, git, and volume endpoints.

### `apps/sandagent-daemon/src/nextjs.ts`

- Added a Next.js route-handler adapter that reuses the daemon router in app-router endpoints.

### `apps/sandagent-daemon/src/routes/health.ts`

- Added a health route helper returning the configured root and volumes paths.

### `apps/sandagent-daemon/src/routes/fs.ts`

- Added filesystem list, read, stat, exists, search, write, append, mkdir, remove, move, and copy handlers with root scoping.

### `apps/sandagent-daemon/src/routes/git.ts`

- Added git status, exec, clone, and init handlers with a command allowlist and tracked-file reporting.

### `apps/sandagent-daemon/src/routes/volumes.ts`

- Added volume listing, creation, and removal helpers backed by the daemon state paths.

### `apps/sandagent-daemon/src/__tests__/daemon.test.ts`

- Added end-to-end daemon tests covering health, filesystem, volume, git, and not-found routes.

### `docs/changelog/2026-03-18-sandagent-daemon-package-scaffold.md`

- Documented the session changes and PR preparation work.

### `pnpm-lock.yaml`

- Added the daemon package importer and its development dependency resolutions to the workspace lockfile.
