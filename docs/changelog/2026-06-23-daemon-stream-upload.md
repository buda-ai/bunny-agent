# Session changelog - 2026-06-23 daemon stream upload

## Changes

- Added `PUT /api/fs/write-stream` for raw streamed file uploads to the daemon.
- Implemented the endpoint in both the standalone HTTP server and the Next.js adapter.
- Added a shared `fsWriteStream` helper that pipes the request body to a temporary `.part` file, enforces a 512 MiB default size cap, and renames the file only after a successful stream.
- Preserved the legacy multipart `/api/fs/upload` endpoint unchanged.
- Added tests for successful streamed uploads, nested directory creation, `create_dirs=false`, path traversal rejection, size-limit cleanup, client-abort cleanup, and Next.js adapter routing.
- Updated `apps/daemon/README.md` with the new filesystem endpoint and `curl --data-binary` examples.

## Validation

- `pnpm --filter @bunny-agent/daemon test` passes.
- `pnpm --filter @bunny-agent/daemon typecheck` is currently blocked by a pre-existing stale `@bunny-agent/runner-harness` declaration mismatch around `systemEnv`, unrelated to the stream upload changes.
