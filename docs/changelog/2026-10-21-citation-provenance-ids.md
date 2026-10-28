# Preserve opaque citation provenance IDs

## Problem

The public search and citation contracts accept nonempty tool-call IDs, but the
Pi source registry and session restoration independently rejected IDs longer than
1,024 characters. A successful Gemini search could therefore lose its sources
and leave citations unresolved.

## Changes

- Remove the inconsistent length restriction in source registration, cached
  source validation, tool-result reconstruction, and search-turn restoration.
- Preserve provider IDs exactly. Keep nonempty-ID, source identity, provenance
  count, and branch-history validation.
- Add regression coverage for IDs of 1,024, 1,025, 1,094, 1,998, and 8,192 characters,
  including citation metadata validation and session restoration.

## Verification

- Citation processor, source provenance, session cache, real offline Pi session,
  stream conversion, and Harness integration: 105 tests pass across seven files.
- The 23 focused provenance checks produce 17 failures against the unchanged
  implementation and pass with the fix. The 1,024-character boundary still works.
- Synthetic signed IDs retain their complete identity through the real Pi tool
  execution and output stream, disk reopening, compaction, and a fork restored
  in a separate Node process. Sibling branch sources remain excluded.
- Pi runner TypeScript check passes.
- Offline replay of a successful search with a 1,094-character tool-call ID:
  all six citation groups resolve into nine valid annotations, with no registry
  diagnostics. This is a stored-result replay, not a new provider request.

Not verified: a newly published package or image, or deployment of this fix.
