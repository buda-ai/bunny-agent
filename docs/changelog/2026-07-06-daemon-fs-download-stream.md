# daemon: stream fs/download instead of buffering into memory

Date: 2026-07-06

## Summary

`/api/fs/download` used to `fs.readFile(target)` the whole file into a
Buffer and then write it to the response in one go. For small files this
is fine; for anything > a few MB it pins that many bytes of RAM inside
the daemon while the response streams out.

Switch the transport to `createReadStream(path)` piped into the
response. `fsDownload` now only stats the file (returns `{ path, size }`)
so the HTTP layer can set `Content-Length`, pick the MIME type, and
stream bytes end-to-end. Memory stays constant regardless of file size.

## Motivation

Upcoming work (buda's share-copy job) copies pi session files across
sandboxes by piping `fs/download` on the source daemon into
`fs/write-stream` on the target. `fs/write-stream` was already true
streaming; `fs/download` was the last remaining full-buffer link on the
copy path. Fixing it here means the whole hop is stream-only — no
sandbox daemon RAM spikes, no buda-side buffering.

## Changes

- `apps/daemon/src/routes/fs.ts`
  - `fsDownload` no longer reads the file. It stats it, rejects
    directories (400), and returns `{ path, size }`. Callers own the
    stream.
- `apps/daemon/src/server.ts`
  - The `GET /api/fs/download` handler on the Node `http` server pipes
    `createReadStream(resolvedPath)` into `res` via
    `stream/promises.pipeline`. Errors mid-stream destroy the response
    (client sees a broken stream, not a truncated "success").
- `apps/daemon/src/nextjs.ts`
  - The `Response` variant wraps `createReadStream` with `Readable.toWeb`
    so it can be handed to `new Response(webStream, ...)` — the Fetch
    runtime then owns end-to-end streaming.

## Tests

- `apps/daemon/src/__tests__/daemon.test.ts` — new `describe("fs download")`
  block:
  - text file: streams the same bytes back with `Content-Length` and a
    plain-text MIME type.
  - binary file: writes non-UTF-8 bytes (`0x00 0xff 0x7f 0x80 …`) via
    `node:fs` and asserts the downloaded buffer is byte-equal — protects
    against future accidental UTF-8 round-tripping regressions.
  - `path` missing → 400.
  - target is a directory → 400 with a descriptive error.

## Verification

- `pnpm --filter @bunny-agent/daemon test` — 107 pass (4 new)
- `pnpm --filter @bunny-agent/daemon typecheck` — clean
- `pnpm run -w lint` — clean

## Non-goals

- No API change. Query params, response headers, and success bodies are
  identical. Only the wire behavior changes (streaming vs single write).
- CLI / SDK / manager unchanged.
