# Add SandAgent Daemon Package Scaffold

## Date: 2026-03-18

## Summary

Prepared a pull request for the initial `apps/sandagent-daemon` package scaffold.

## Changes

### `apps/sandagent-daemon/package.json`

- Added package metadata, build scripts, runtime dependency, and development dependencies for the daemon app.

### `apps/sandagent-daemon/tsconfig.json`

- Added a package-local TypeScript configuration extending the workspace base config.

### `apps/sandagent-daemon/src/utils.ts`

- Added shared API envelope helpers, application state types, safe path resolution helpers, and directory creation utilities.

### `apps/sandagent-daemon/src/proxy.ts`

- Added a lightweight HTTP proxy helper for routing daemon requests to downstream services.

### `apps/sandagent-daemon/src/routes/health.ts`

- Added a health route helper returning the configured root and volumes paths.

### `apps/sandagent-daemon/src/routes/volumes.ts`

- Added volume listing, creation, and removal helpers backed by the daemon state paths.

### `docs/changelog/2026-03-18-sandagent-daemon-package-scaffold.md`

- Documented the session changes and PR preparation work.
