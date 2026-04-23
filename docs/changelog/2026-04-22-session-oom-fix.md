# 2026-04-22 — Fix SessionManager OOM on resume

## Problem

Pi's `SessionManager.list(cwd)` loads and parses every session JSONL file in the
directory. With many or large session files (some exceeding 12MB), this causes
out-of-memory crashes in sandbox environments with limited RAM.

Additionally, `SessionManager.open(path)` reads the entire file into memory,
which can OOM on individual large session files that have accumulated many
entries over time (compaction appends entries but never truncates).

## Changes

### `packages/runner-pi/src/session-utils.ts` (new)

Lightweight session utilities that avoid loading full session files:

- **`resolveSessionPathById(cwd, sessionId)`** — Finds session file by scanning
  directory entry names for `*_<id>.jsonl` suffix. O(n) filenames, no content
  parsing. Replaces `SessionManager.list()` which parsed every file.

- **`isSessionFileTooLarge(sessionPath)`** — Checks file size against 10MB
  threshold (aligned with OpenClaw's `rotateBytes` setting). Returns true if
  the file would likely OOM during `SessionManager.open()`.

- **`extractLastCompactionSummary(sessionPath)`** — Reads only the last 1MB
  of the file to find the most recent compaction summary. Avoids loading the
  entire file. The summary is used to seed a new session so the agent retains
  context from the previous conversation.

### `packages/runner-pi/src/pi-runner.ts`

Updated session resume logic:

1. Use `resolveSessionPathById` instead of `SessionManager.list(cwd)`
2. Check file size before `SessionManager.open()`
3. If file is too large: create a fresh session, extract the last compaction
   summary from the old file, and write it as a `CompactionEntry` in the new
   session via `SessionManager.appendCompaction()`

### `packages/benchmark-shared/tsconfig.json`

Added `"types": ["node"]` to fix `console` not found build error on v0.9.28.

## Testing

- Added `session-utils.test.ts` with 9 tests covering all three utilities
- All 76 runner-pi tests pass
