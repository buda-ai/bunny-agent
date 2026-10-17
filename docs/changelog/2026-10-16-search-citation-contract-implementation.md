# Opt-in search and answer citation contract

Date: 2026-10-16
Baseline: main@38c228c (v0.9.62)

Requests selecting `searchContractVersion: 1` now retain structured search
results and answer citations across runner, daemon, SDK, and durable AI SDK
UIMessage boundaries. Unspecified requests retain legacy search behavior.

- Publish browser-safe contracts through `@bunny-agent/manager/contracts`
  and `@bunny-agent/sdk/contracts`. Keep URL hashing and record construction
  in separate server subpaths. Canonical answer annotations contain only
  the flat Responses `url_citation` fields, including required `title`.
- Project Brave/Tavily/DuckDuckGo retrieval into a versioned
  `web_search_call` envelope with full SHA-256 URL identities. Distinguish
  confirmed empty results, unavailable details, discarded unsafe sources,
  and sanitized typed failures. Codex remains truthful about query-only
  output and unavailable citations.
- Resolve model-authored `[[cite:<source_id>]]` references into visible
  `[n]` markers, code-point offsets, and separate provenance bindings.
  Bound processing state, preserve Markdown code/escape contexts, and
  retain emitted text on abort or limits. Native ingestion has fixture
  coverage; current Pi/Codex adapters keep `native_annotations: false`.
- Restore source identities through supported Pi custom session entries,
  compaction, process restart, and branch-aware fork ancestry. Model text
  and fetched snippets cannot create trusted registry entries.
- Preserve capabilities, actual text IDs, citations, cited URL sources,
  structured success/errors, and unrelated provider/session metadata in
  SDK streaming and generation. Isolate concurrent calls on the same model
  and reject missing acknowledgements or unexpected EOF without retry.
- Preserve structured search failures on final tool parts in
  `resultProviderMetadata["bunny-agent"].search_result`, independently of
  `output`. Expose `projectUIMessageOutputText()` for browser-safe replay
  from completed JSON with no live registry.
- Honor explicitly supplied SDK `yolo` options in CLI fallback without
  changing unspecified approval defaults. Add the pinned Pi package's
  missing `getBuiltinModel` declaration using its actual lookup signature.

## Compatibility and validation

V1 requires stable `ai >=6.0.264 <7.0.0`; older peers such as `6.0.105`
discard result metadata and are rejected before execution. Legacy calls
retain the existing `ai: ^6.0.0` peer range. Packaged React hooks now use
`@ai-sdk/react ^3.0.267`, aligned with the verified AI SDK baseline.

The actual model -> native Pi -> daemon/CLI -> SDK -> AI SDK UIMessage
matrix passed all 10 controlled-provider scenarios: success, empty, HTTP
429, authentication failure, and legacy on both transports. Successful
answers contained model-authored references; every annotation resolved to
its exact emitted substring and registered URL. Failed/empty searches
created no citations.

Affected verification passed 44 test files / 536 tests, strict scoped SDK/Pi
TypeScript checks, manager compilation, and SDK builds/declarations.
Published-condition Node imports, declaration consumers, and browser
contracts bundles passed. The compiled SDK root retained metadata with a
supported peer fixture and rejected an old peer before sandbox attachment.
Peer resolution uses lazy Node `createRequire`, with compiled regressions
covering ES2022 bundling that can remove dynamic JSON import attributes.
Seven JSON examples and the handoff fixture match public contract helpers.
Tests use source aliases and isolated versions matching the declared Pi
1.2.0 dependencies. No installed dependency source is patched. The detailed
OpenSpec verification report records evidence levels and remaining gates.

A fresh real Tavily API citation run (OpenSpec task 7.2) remains pending a
new runtime credential. Earlier real Tavily source-card evidence is not
acceptance evidence for this protocol. Native annotations require a
supported upstream adapter and separate live verification.

`docs/search-citation-contract.md` documents migration and a Buda consumer
checklist. `docs/fixtures/search-citation-contract-handoff.json` is a
validated illustrative fixture, explicitly separate from captured live
responses. The downstream kapps change still owns inline citation UI,
structured-first cards, database persistence, reload, and fork acceptance.
PR #8009 implements retrieved-source cards and does not implement this
answer annotation contract.
