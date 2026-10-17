# Search and citation contract (`searchContractVersion: 1`)

**Status:** opt-in, request-scoped. Omitting `searchContractVersion` preserves
legacy behavior byte-for-byte in every touched file. This document describes
the versioned retrieval/citation contract defined in
`packages/manager/src/contracts/` and re-exported browser-safe as
`@bunny-agent/sdk/contracts`.

This is a BunnyAgent protocol document. It does not describe, imply, or
depend on any Buda Cloud / OpenBuda UI or database change. The downstream
consumer work (structured-first source cards, clickable inline citation
ranges, database persistence of annotations) is explicitly out of scope here
— see "Downstream handoff boundaries" below.

## Requesting the contract

Set `searchContractVersion: 1` on the request. This is forwarded unchanged
through every layer:

- SDK: `BunnyAgentProviderSettings.searchContractVersion` (provider settings)
  or per-call `runner.searchContractVersion`.
- Manager `RunnerSpec.searchContractVersion` / `BunnyAgentCodingRunBody.searchContractVersion`.
- CLI: `--search-contract-version 1`.
- Daemon request body: same field name, forwarded unchanged.

It is never a process-global switch — two concurrent requests through the
same daemon/CLI process, one with the field set and one without, each get
their own behavior.

## Capability acknowledgement

A valid explicit `searchContractVersion: 1` request receives a `start`/
`message-metadata` SSE chunk carrying `messageMetadata.searchContract`, an
honest `SearchContractCapabilities` object:

```json
{
  "version": 1,
  "structured_retrieval": true,
  "native_annotations": false,
  "explicit_source_marker_annotations": true
}
```

Capabilities are **never inferred** from source presence or tool output —
they come only from the runner's own declared, validated acknowledgement
(`isSearchContractCapabilities`, exported from `@bunny-agent/sdk/contracts`).

### Fail-closed semantics

An explicit `searchContractVersion: 1` request that never receives a valid
acknowledgement — because the peer is an older release that silently ignores
the option, because the stream ends (including premature EOF) before any
acknowledgement arrives, or because the acknowledgement payload is
structurally malformed (e.g. `structured_retrieval: "yes"` instead of a
boolean) — is treated as an explicit error by the SDK. There is no automatic
retry and no silent fallback to legacy text. A missing acknowledgement and a
malformed acknowledgement are indistinguishable failure modes; both fail
closed identically.

## Runner support matrix

| Runner | `structured_retrieval` | `native_annotations` | `explicit_source_marker_annotations` |
|---|---|---|---|
| pi | ✅ `details.web_search` structured success/failure envelope on Brave/Tavily/DuckDuckGo | ❌ | ✅ assistant-authored `[[cite:<source_id>]]` markers resolved into `[n]` + `url_citation` annotations |
| codex | ⚠️ query-only; Codex's web-search tool is a provider-executed black box with no retrievable result payload — adapted into a truthful `source_details: "unavailable"` v1 envelope rather than inventing sources or a false zero-hit result | ❌ | ❌ (no bridge; Codex never surfaces assistant-visible search results to attach markers to) |
| claude, gemini, opencode, copilot | ❌ unsupported runner for this version | ❌ | ❌ |

`native_annotations` is `false` for every runner today. This is a currently
installed-dependency fact, not a BunnyAgent-side design choice: the installed
Pi stack (`@earendil-works/pi-ai` 1.2.0) exposes `textSignature` on
`TextContent` but no annotations field, so Pi cannot natively ingest or
forward Responses-shaped annotations. The native-annotation ingestion
boundary (`CitationTextProcessor.ingestNative`, see "Native annotations"
below) is implemented and covered by recorded fixtures, but it is not wired
to any live provider path, and no live run has exercised it. Enabling
`native_annotations: true` for a runner requires both an upstream
adapter/SDK release that actually exposes provider annotations and a new
live end-to-end test against that release — neither is part of this change.

## Retrieval contract: `WebSearchCallRecord`

A structured, typed record of one search tool call, carried in
`details.web_search` (tool-visible) and in `providerMetadata["bunny-agent"]`
(`search_result` on failure; the tool's own `output` on success):

```json
{
  "schema_version": 1,
  "type": "web_search_call",
  "id": "call_fixture_1",
  "status": "completed",
  "action": {
    "type": "search",
    "query": "bunny agent citation contract example",
    "sources": [
      {
        "type": "url",
        "source_id": "src_de106e607d0e711199de3fb7eb98fe5d412ee49ac326eadd3db848ee272ad2cb",
        "url": "https://example.com/docs",
        "title": "Documentation"
      }
    ]
  },
  "source_details": "available",
  "results": [
    {
      "source_id": "src_de106e607d0e711199de3fb7eb98fe5d412ee49ac326eadd3db848ee272ad2cb",
      "url": "https://example.com/docs",
      "title": "Documentation",
      "snippet": "A readable description of the documentation page."
    }
  ],
  "provider": "tavily",
  "truncated": false
}
```

`schema_version`, `source_id`, `source_details`, `results`, `provider`, and
`truncated` are Bunny extensions on top of the OpenAI Responses `web_search_call`
shape. `source_details` is `"available"` (results populated), `"unavailable"`
(e.g. Codex's query-only envelope — never a fabricated empty-but-successful
result), or `"partial"`. `id` is the actual local tool-call ID bound at
runner execution, not a provider request ID.

### Structured failures

Failures use `tool-output-error` with a sanitized error string plus the
structured failed envelope in `providerMetadata["bunny-agent"].search_result`:

```json
{
  "schema_version": 1,
  "type": "web_search_call",
  "id": "call_fixture_2",
  "status": "failed",
  "action": { "type": "search", "query": "bunny agent citation contract example", "sources": [] },
  "source_details": "unavailable",
  "results": [],
  "provider": "tavily",
  "truncated": false,
  "error": {
    "code": "rate_limit",
    "message": "Web search rate limit exceeded.",
    "retryable": true
  }
}
```

Error codes are one of a small safe set (`authentication`, `rate_limit`,
`network`, `invalid_request`, `provider_error`) with a sanitized message —
raw provider response bodies, which can echo credentials or request dumps,
are never forwarded into this field or into model-visible tool content.

## Source identity

Source IDs are `src_<sha256-hex>`, derived deterministically and purely from
a normalized, validated `http(s)` URL — no per-process salt, no timestamp.
The same URL always produces the same ID, in this process or a different
one, enabling resume/fork/compaction to reuse identities instead of
re-minting them. Path, query, and fragment are preserved verbatim (tracking
parameters are not stripped, since stripping would create false equivalence
between distinct URLs).

Derivation is server-only (`packages/manager/src/contracts/source-id.ts`,
using `node:crypto`) and is **not** re-exported from the browser-safe
`@bunny-agent/sdk/contracts` barrel — only server/runner code that actually
registers sources needs it.

## Answer citation contract

Independently projected from a finalized text part, attached to the
runner's `text-end` event:

```json
{
  "type": "text-end",
  "id": "text_fixture_1",
  "providerMetadata": {
    "bunny-agent": {
      "sessionId": "session_fixture_1",
      "citation_contract": {
        "schema_version": 1,
        "offset_unit": "unicode-code-points",
        "processing": "complete",
        "annotations": [
          {
            "type": "url_citation",
            "start_index": 4,
            "end_index": 7,
            "url": "https://example.com/docs",
            "title": "Documentation"
          }
        ],
        "bindings": [
          {
            "annotation_index": 0,
            "source_id": "src_de106e607d0e711199de3fb7eb98fe5d412ee49ac326eadd3db848ee272ad2cb",
            "origin": "explicit_source_marker",
            "tool_call_ids": ["call_fixture_1"]
          }
        ]
      }
    }
  }
}
```

Flat `annotations` carry only `type`/`start_index`/`end_index`/`url`/`title`
— no provenance, no source ID. Provenance and source/tool-call associations
live in the sibling `bindings` array, keyed by `annotation_index`. Empty
`annotations`/`bindings` arrays are valid and do not imply sources were
unavailable. `processing` is `"complete"` or `"partial"`; when `"partial"`,
sanitized `diagnostics` (codes: `invalid_version`, `invalid_range`,
`unsafe_target`, `duplicate_range`, `unknown_source`, `malformed_token`,
`budget_exceeded`, `unavailable_offset_unit`) explain what was rejected or
truncated, without leaking secrets.

### Unicode code-point offsets

`start_index`/`end_index` are **zero-based Unicode code-point offsets with an
exclusive end**, measured over the exact emitted Markdown text of one text
part, before any rendering, normalization, or line-ending conversion.

Canonical example: for the text `A😀B [1]`, the literal `[1]` marker is
code-point range `[4, 7)` and UTF-16 range `[5, 8)` — the leading 😀 is one
Unicode code point but two UTF-16 code units (a surrogate pair). JavaScript
consumers slicing this text or mapping it onto Markdown AST positions (which
are typically UTF-16-based in JS tooling) must use a tested conversion
helper rather than raw `String.prototype.slice`:

```ts
import { utf16RangeToCodePointRange, sliceByCodePointRange } from "@bunny-agent/sdk/contracts";

utf16RangeToCodePointRange("A😀B [1]", 5, 8); // => { start_index: 4, end_index: 7 }
sliceByCodePointRange("A😀B [1]", 4, 7);      // => "[1]"
```

### Explicit source marker bridge (non-native tools)

For tools without native provider annotations, the model is instructed
(guidance text from `citationSourceGuidance()` in
`packages/runner-pi/src/citation-session-cache.ts`) to emit
`[[cite:<source_id>]]` immediately after a supported statement. A bounded
incremental tokenizer (`CitationTextProcessor` in
`packages/runner-pi/src/citation-processor.ts`) resolves valid tokens into a
visible `[n]` marker plus a flat annotation spanning exactly that emitted
marker, plus a binding with `origin: "explicit_source_marker"`. Numbers are
stable by first reference within one assistant message and shared across
that message's text parts.

Unknown source IDs, malformed tokens, and markers inside inline code spans or
fenced code blocks are retained as literal text and produce no annotation —
the tokenizer tracks Markdown code/escape state across streamed chunk
boundaries, including quoted/list-nested fences and a token or surrogate
pair split across two chunks. Standalone indented code stays literal.
This is a model-facing mechanism only; it is not semantic fact-checking, and
a response with no valid references produces no annotations even if a search
ran.

### Native annotations (fixture-tested only, not live)

A typed ingestion boundary (`CitationTextProcessor.ingestNative`) accepts
text identity, a declared offset unit (`"utf-16"` or
`"unicode-code-points"`), and provider annotation data; it validates flat
`url_citation` shapes, rejects unsafe URLs, converts offsets when needed,
deduplicates, and records `origin: "provider"`. Native mode is selected
before the first visible delta for a text part and never rewrites emitted
text; a marker-mode text part rejects native annotations arriving late
against its already-emitted, pre-rewrite text. As stated above, no installed
runner currently selects native mode — this boundary exists and is tested
against recorded fixtures, with no live provider wired to it.

## Processing limits

From `SEARCH_CONTRACT_LIMITS` (`packages/manager/src/contracts/types.ts`):

| Limit | Value |
|---|---|
| `maxSourcesPerSearch` | 50 |
| `maxSourcesPerTurn` | 500 |
| `maxAnnotationsPerTextPart` | 1,000 |
| `maxCodePointsPerTextPart` | 256,000 |
| `maxPendingMarkerSuffixChars` | 128 |

The same 128-character cap bounds retained Markdown container-prefix state.
Exceeding it keeps the remaining text literal with a partial-processing
diagnostic, preserving all previously emitted text and annotations.

Exceeding a limit truncates or rejects only the affected metadata with an
explicit diagnostic (`processing: "partial"`); previously emitted text and
already-valid annotations are preserved. A turn's working registry budget is
separate from persisted historical source identities — restoring session
history does not erase prior identities, and only a bounded current-turn
view is exposed back to the model for citation resolution.

## Session resume, compaction, and fork

Pi's source registry persists through `SessionManager.appendCustomEntry`
under the versioned custom-entry type `"bunny-agent.search-sources.v1"`
(`packages/runner-pi/src/citation-session-cache.ts`). On fresh-process
resume, after compaction, and after a fork, the registry is reconstructed
from entries reachable on the resumed/forked branch only — sibling or
future-branch entries on the same session tree are not imported. A forked
session inherits the identities registered on its source branch up to the
fork point. This registry is an internal generation aid; it is not required
for replaying an already-completed UIMessage, since durable per-message
metadata (`textPartId`, `citation_contract`, `searchContract`) carries
everything a consumer needs.

## SDK stream, generate, and UIMessage mapping

- `source-url` runner chunks map to `LanguageModelV3Source`
  (`{ type: "source", sourceType: "url", id, url, title? }`), deduplicated
  per stream, emitted only for actually cited sources (not every retrieved
  source). `toUIMessageStream()` requires `{ sendSources: true }` to forward
  these as `source-url` UI parts — this is an AI SDK default, not a
  BunnyAgent-specific omission, and is easy to miss.
- `text-end`'s `providerMetadata["bunny-agent"]` carries `citation_contract`
  merged with `sessionId` and any other provider fields; `doGenerate()`
  carries the same per-text metadata, source, and tool-result content as
  `doStream()`.
- `projectUIMessageOutputText(message)`, exported from
  `@bunny-agent/sdk/contracts`, projects a completed UIMessage's text parts,
  in order, into `{ textPartId?, output_text, bindings, searchContract? }`
  entries — `output_text` is the flat Responses-shaped
  `{ type: "output_text", text, annotations }`, with `bindings` and
  `searchContract` kept alongside rather than inside it. `textPartId` is the
  runner's actual text-event ID (`providerMetadata["bunny-agent"].textPartId`),
  not a synthesized array index, so it survives serialization and
  cross-process rehydration. Legacy or unrecognized-version text parts
  project as plain text with empty `annotations`/`bindings`. A recognized
  `schema_version: 1` citation part that is structurally invalid, out of
  text bounds, missing its durable `textPartId`, or missing a valid
  `searchContract` acknowledgement makes `projectUIMessageOutputText` throw
  `TypeError` rather than silently degrade — there is no inference from
  Markdown links, raw tool snippets, or source cards.

### AI SDK compatibility

Opt-in v1 requires a stable AI SDK 6 peer at `>=6.0.264 <7.0.0`, the
verified baseline that preserves tool-result metadata through
`streamText().toUIMessageStream()` and `readUIMessageStream()`. Earlier
releases such as `ai@6.0.105` discard that metadata. The SDK checks the
consumer's actual peer version before attaching a sandbox or executing a
v1 request and rejects unsupported peers without retrying. Legacy calls
retain the existing `ai: ^6.0.0` peer range and skip this feature check.
The packaged React hooks require `@ai-sdk/react >=3.0.267` within v3,
which uses the same verified AI SDK baseline.

Completed tool parts store result metadata in `resultProviderMetadata`;
`callProviderMetadata` describes tool input. In particular, an
`output-error` search part carries its failed envelope in
`resultProviderMetadata["bunny-agent"].search_result`. Consumers must not
assume an error part has `output`.

The independent daemon/CLI matrix uses an actual model with controlled
provider HTTP responses and covers success, empty results, HTTP 429,
authentication failure, and legacy requests on both transports. This
verifies model-authored source markers, exact citation substrings, and
final UIMessage metadata. A fresh real Tavily API citation run remains a
separate acceptance gate requiring a new runtime credential. Earlier
source-card evidence does not complete that gate.

## Legacy rollback

Removing `searchContractVersion` from a caller restores legacy behavior
exactly. Rollback does not delete already-persisted versioned metadata or
source IDs on previously completed messages, and does not require rewriting
message text — only new requests stop requesting the contract.

## Downstream handoff boundaries

This document and the illustrative fixture at
[`docs/fixtures/search-citation-contract-handoff.json`](./fixtures/search-citation-contract-handoff.json)
describe the BunnyAgent-side protocol only. They are not evidence of, and do
not imply:

- Live native-provider annotation support (`native_annotations` is `false`
  for every runner today, for the dependency reasons above).
- Any Buda Cloud / OpenBuda UI rendering of inline citation ranges or source
  cards, or any database schema/persistence change for citation data. PR
  #8009 (Buda's existing search-card UI) does not implement this annotation
  protocol and is not being relabeled as doing so here.
- That the fixture reflects a real captured provider response. It is
  hand-constructed and validated against the real public contract helpers
  (see the fixture file's own `_meta` block), not recorded from a live
  Tavily/Pi run.

A downstream Buda change can use this contract to build a structured-first
source-card parser, clickable inline citation ranges rendered against
original Markdown, and database-backed persistence/reload/fork of citation
metadata — that work, and its own acceptance evidence, belongs to that
change, not to this one.

## Buda consumer conformance checklist

Each item names the exact contract field a downstream Buda change must
read, and the acceptance test that change would need to write to prove it
handles that field correctly. None of these tests exist in this repository
— BunnyAgent does not implement or test any Buda-side rendering or
persistence.

| Checklist item | Contract field(s) | Downstream acceptance test to write |
|---|---|---|
| Parse structured search results instead of scraping tool text | `dynamic-tool` part `output`/`resultProviderMetadata["bunny-agent"].search_result` (`WebSearchCallRecord`) | Feed a recorded `output-available` and a recorded `output-error` dynamic-tool part through the Buda parser; assert it reads `source_details`/`results`/`error.code` and never falls back to parsing tool text for v1 parts. |
| Render inline citation ranges against the original Markdown, not a re-rendered/normalized copy | `citation_contract.annotations[].start_index`/`end_index` (Unicode code points), `citation_contract.offset_unit` | Render the fixture's `A😀B [1]` text with the fixture's annotation range; assert the highlighted substring is exactly `[1]`, including when the renderer's internal representation is UTF-16 (must convert via `utf16RangeToCodePointRange`/`codePointOffsetToUtf16Index`, not slice raw UTF-16 offsets). |
| Resolve each annotation to its source without leaking internal registry state | `citation_contract.bindings[].source_id`/`origin`/`tool_call_ids`, cross-referenced against the matching `dynamic-tool` part's `output.action.sources[]` or `output.results[]` | Assert the renderer resolves a binding's `source_id` to a source already present in that same message's tool output — never by calling back into a live BunnyAgent registry/session. |
| Only render links for actually-cited sources, not every retrieved source | `source-url` UI parts (requires `sendSources: true`) vs. the full `results[]` list in the tool output | Assert a source present in `results[]` but absent from any `citation_contract.bindings[]` does not produce a clickable inline citation, even though it may still be shown as a "searched" result. |
| Persist citation metadata durably (survive reload) | `textPartId`, `citation_contract`, `searchContract` under `providerMetadata["bunny-agent"]` on each `text` part | Serialize a completed message to the Buda database and back (JSON round-trip, matching this repo's own `rehydrates completed message JSON` SDK test); assert `projectUIMessageOutputText` on the rehydrated message equals the pre-persistence projection. |
| Reconstruct citations after a forked/resumed conversation without a live registry | Durable per-message metadata only — no registry RPC | Load a persisted message from a forked branch with no live BunnyAgent session attached; assert citation rendering still succeeds using only the message's own stored metadata. |
| Never fabricate an annotation from a Markdown link or raw search snippet | Absence of `citation_contract` metadata on parts that were never processed as v1 | Feed a legacy (non-v1) message containing a plain Markdown link through the renderer; assert it is rendered as an ordinary link, not an inline citation. |
| Treat a missing/invalid citation contract as a hard failure, not silent degrade | `projectUIMessageOutputText` throwing `TypeError` for malformed `schema_version: 1` data | Feed the malformed-annotation fixture from `packages/sdk/src/__tests__/citation-stream-mapping.test.ts` ("does not emit unsafe, uncited, mismatched, or malformed-v1 sources") through the Buda parser; assert it surfaces an error state rather than rendering a plausible-looking but wrong citation. |
| Do not claim or depend on native-provider annotation rendering | `searchContract.native_annotations` (always `false` today) | Assert the Buda renderer's "native annotation" code path, if any, is gated on `native_annotations === true` and is therefore currently unreachable/untested with live data — document this as a known gap rather than silently shipping dead code. |
