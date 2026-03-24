# Daemon Error Resilience

**Date**: 2026-03-24

## Problem

The `sandagent-daemon` would crash entirely when receiving a malformed request.
For example, sending a multipart form to a mistyped URL (e.g., `/api/fs/uploa1d`
instead of `/api/fs/upload`) caused `JSON.parse` to fail on binary/multipart data,
throwing an unhandled `SyntaxError` that killed the Node.js process.

## Changes

### `apps/daemon/src/server.ts`

1. **Top-level try-catch** around the entire `http.createServer` callback — any
   unhandled error now returns a 500 JSON response instead of crashing the process.
2. **Safe JSON parsing** via `safeJsonParse()` — throws `AppError(400)` with a
   readable message instead of an unguarded `SyntaxError`.
3. **Content-type guard for non-upload POST routes** — if a request has
   `multipart/form-data` or `application/x-www-form-urlencoded` content-type but
   hits a JSON-only endpoint, it returns a clear 400 error immediately.
4. **`sendJson()` helper** — DRY helper for writing JSON responses.

### `apps/daemon/src/cli.ts`

5. **Process-level safety net** — added `uncaughtException` and
   `unhandledRejection` handlers that log errors but keep the server running.
