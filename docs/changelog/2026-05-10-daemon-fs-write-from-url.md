# Daemon fs/write-from-url streaming endpoint

Date: 2026-05-10
AI Agent: Claude

## Changes

- Added `POST /api/fs/write-from-url` to the daemon. The daemon now pulls a remote URL directly into a volume-rooted file using a streamed `pipeline`, tmp file + rename, and an `AbortController` driven by total and idle timeouts.
- Added a global concurrency gate (`MAX_CONCURRENT_WRITE_FROM_URL = 2`) so multiple large downloads queue on the semaphore instead of piling up in memory.
- Only `http:` and `https:` URLs are accepted. Path traversal protection reuses `resolveUnderRoot`.
- Response shape: `{ ok, data: { path, size, contentType } }`. Failures unlink the `.part` tmp file and surface the upstream status code through `AppError`.
- Extended the daemon test suite with five new cases covering the happy path, upstream 404 cleanup, protocol rejection, path-traversal rejection, and idle-timeout abort.

## Why

Buda previously downloaded Ark-generated videos into the Next.js process and re-uploaded them through `/api/fs/upload`, forcing the whole video to live in app memory and crossing the public network twice. With the new endpoint, Buda only sends a short JSON request carrying the signed Ark URL and the target path. Only the daemon touches the bytes, streaming them straight onto the sandbox volume.

Keeping the provider credentials in Buda was the other requirement: the daemon never learns about Ark; it just writes whatever URL it is told to. That preserves the trust boundary between the service backend and the user sandbox.

## Follow-ups

- Rebundle the daemon and refresh the sandbox base image / `patches/` in kapps before rolling out the Buda-side switch.
- Consider adding a `sha256` or `expected_content_type` guard if we later accept daemon-side URLs from less trusted sources.
