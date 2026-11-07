# Pi Session Image Storage and Lossless Recovery

Date: 2026-11-06

## Request

Implement the first scoped repair for reported Claude conversation amnesia:
externalize image payloads and stop oversized-session recovery from silently
losing the user's task. Related investigation: vikadata/kapps#8243.

## Changes

- Store image payloads once in content-addressed sidecar files and persist small
  references in Pi JSONL. Restore and verify exact image data before model use.
- Ship a per-instance persistence adapter with Bunny, covering append, rewrite,
  resume, file switching, branching and cross-directory forks. Avoid relying on
  workspace dependency patches that npm consumers do not receive.
- Migrate legacy sessions with bounded line reads and an atomic replacement,
  retaining an original backup and every entry/parent link.
- Replace the old tail-only reset with an explicit failure when safe migration
  cannot complete. Preserve both original task instructions and newer corrections.
- Preflight image hydration against a configurable 64 MiB budget, counting
  repeated image blocks, and reject oversized individual blobs before loading.
- Omit image payloads from debug event traces.

## Validation

- Real Pi/filesystem tests cover deduplication, restarts, branch rewrites,
  cross-directory forks, missing/corrupt media and failed writes.
- A real local HTTP round-trip exercises createPiRunner and Pi's provider
  serializer. An 11,185,685-byte legacy transcript migrates to 1,071 bytes before
  the next turn. Two restarts retain the same session ID, goal, latest instruction
  and exact images in outgoing requests; JSONL and debug traces contain no image
  base64. The HTTP endpoint returns fixture responses, not model inference.
- All 427 runner-pi tests across 32 files passed, including the real HTTP test.
  Scoped typecheck, build, changed-file Biome checks and git diff checks passed.
- The compiled adapter was tested separately with the unpatched npm Pi 1.3.0
  tarball: two image blocks deduplicated to one sidecar and 713 JSONL bytes;
  restart and cross-directory fork still worked after removing source media.
  The dependency's SessionManager file matches the stock npm package exactly.

### Local application checks

Local Buda was connected to the rebuilt Bunny daemon with isolated storage,
database and Redis. Claude read all ten uploaded images. GPT retained the task
and latest instruction after a 19,998,709-byte legacy transcript migrated to
92,191 bytes through a daemon restart.

The initial acceptance notes incorrectly attributed the recovery response to
Claude. Per-response model metadata shows that Auto selected GPT for those later
turns. That attribution is corrected here. A subsequent run with Claude explicitly
selected failed to recall the original project and image facts, although the
complete entries remained in JSONL. This validates storage preservation, not a
complete fix for Claude conversation continuity.

## Design references

- Pi's existing session tree, parent links and compaction boundaries are the
  compatibility contract. The pinned
  [Pi 1.3.0 session manager](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/coding-agent/src/core/session-manager.ts#L476)
  reconstructs context from those entries. Its
  [persistence implementation](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/coding-agent/src/core/session-manager.ts#L1172)
  still serializes whole entries using `JSON.stringify`; it does not provide
  this sidecar design. Content-addressed media storage, migration and recovery
  budgets are Bunny-specific additions, not copied upstream functionality.
- OpenAI's [conversation-state guide](https://developers.openai.com/api/docs/guides/conversation-state)
  and [compaction guide](https://developers.openai.com/api/docs/guides/compaction)
  were reviewed during this follow-up acceptance, after implementation. They
  support preserving the state needed for later turns, but do not prescribe
  JSONL sidecars or SHA-256 storage and were not the original design source.
  This PR does not switch to OpenAI Responses compaction. Storage byte limits
  and a model's context token window remain separate concerns.

## Limits

No production deployment is included. Live-model acceptance covers the local
Buda/Pi path through the configured LiteLLM gateway, not every provider route.
Claude's separate tendency to ignore a task after reading an image remains
outside this PR. Sidecars and backups require retention alongside their JSONL;
old runtimes need inline backups for rollback. Pi still holds hydrated images in
memory, and the adapter must be revalidated against future Pi versions.
