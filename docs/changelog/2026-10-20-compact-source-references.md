# Compact model-facing search References

Date: 2026-10-20

## Decision

- Expose compact deterministic `ref_<12hex>` References in v1 search tool text
  and continuation guidance. Keep complete SHA-256 source IDs in typed search
  details, source persistence, citation bindings, and source events.
- Accept compact and legacy canonical citation markers by exact lookup only.
  Reject compact alias collisions, unknown references, and typographical errors
  without guessing or attaching them to a different source.
- Resolve historical aliases from the request's captured reachable ancestry,
  including sources outside the recent prompt view. Preserve fork, resume, and
  compaction behavior without introducing a global alias map or cache migration.

## Why

Copying a 64-character opaque digest is an unnecessary model task and can corrupt
otherwise valid source references. A compact model-facing alias reduces that
copying burden while canonical identity and provenance remain independent of
model-authored text. An unresolved reference never becomes a valid annotation.

## Supersedes

The requirement for models to copy full canonical source IDs from readable
search results or continuation prompts. Legacy canonical markers remain valid.
The wire contract, Unicode code-point offsets, and automatic runtime capability
negotiation remain unchanged.

## Acceptance

Focused tests cover compact and legacy markers across streaming/surrogate split
boundaries, exact rejection of typos, canonical wire provenance across multiple
search calls, compact alias collisions in current and historical sources, and
real Pi session persistence. Resume, compaction, and fork tests restore aliases
in a fresh Node process while excluding unreachable siblings and future entries.
The six focused test files pass 121 tests. Runner typechecking, Biome checks on
the nine changed TypeScript files, and runner/SDK/daemon builds also pass. Live
consumer acceptance is tracked separately from these local checks.
