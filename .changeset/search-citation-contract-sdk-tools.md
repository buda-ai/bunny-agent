---
"@bunny-agent/manager": minor
"@bunny-agent/runner-cli": minor
"@bunny-agent/sdk": minor
"@bunny-agent/runner-harness": minor
"@bunny-agent/runner-pi": minor
"@bunny-agent/runner-codex": minor
---

Add opt-in `searchContractVersion: 1` support (request-scoped, never a
process-global default) across the SDK provider, runner harness, and the Pi
and Codex runners:

- SDK: forwards `searchContractVersion` end-to-end (daemon body and CLI
  fallback), requires and surfaces an honest runner/daemon capability
  acknowledgement, and fails closed (no retry) when an explicit `1` selection
  is never acknowledged — including when the stream ends prematurely before
  any acknowledgement arrives. Streams now carry cited-source parts
  (`source-url` → `LanguageModelV3Source`) and terminal per-text
  `citation_contract` provider metadata; `doGenerate()` carries the same
  source/tool-result/citation content as `doStream()`.
- Runner harness: validates the requested version/runner pair before
  dispatch and prepends a `message-metadata` capability-acknowledgement chunk
  ahead of the runner's own stream for accepted requests.
- Pi and harness web-search tools: project Brave/Tavily (and, for the
  harness, the DuckDuckGo zero-config fallback) results into a structured
  `details.web_search` envelope with stable source IDs, and produce sanitized
  structured failures for authentication, rate-limit, invalid-request, and
  malformed-response errors — provider error bodies (which can echo
  credentials) are never surfaced in model-visible tool output.
- Codex: adapts its existing query-only web-search completion into a
  truthful "unavailable detail" v1 envelope instead of inventing sources or
  reporting a false zero-hit result.
- Pi: registers a deterministic, URL-derived source identity for each search
  result, persists it across session resume/compaction/fork, and bridges
  non-native citation support by instructing the model to emit
  `[[cite:<source_id>]]` markers, resolved into visible `[n]` references plus
  flat `url_citation` annotations.

V1 requires a stable `ai >=6.0.264 <7.0.0` peer. Unsupported peers fail
before execution because older AI SDK releases discard result metadata;
legacy calls retain the existing `^6.0.0` peer range. Packaged React hooks
use `@ai-sdk/react ^3.0.267`. Explicit `yolo` options now reach CLI fallback
without changing unspecified approval defaults. Current Pi/Codex adapters
still report `native_annotations: false`; native ingestion is fixture-tested
and explicit-marker provenance remains separate from native annotations.

Legacy search behavior (searchContractVersion unspecified) is unchanged. See `docs/search-citation-contract.md` for the full protocol
and `docs/fixtures/search-citation-contract-handoff.json` for a validated
illustrative example.
