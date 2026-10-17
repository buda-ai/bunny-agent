## Context

See `proposal.md` for motivation and scope. The planning baseline is BunnyAgent `main@38c228c`, v0.9.62, with downstream inspection of kapps PR #8009 at `8d4ac7f921`.

Observed boundaries:

| Boundary | Observed behavior | Consequence |
| --- | --- | --- |
| `packages/runner-pi/src/web-tools.ts` | Search returns formatted text and `details.usage`; provider failures are returned as ordinary error text | Consumers parse provider text and cannot rely on a typed failure |
| `packages/runner-harness/src/tools/web-search.ts` and `tools/types.ts` | Shared search results use `link` internally and a text ToolDefinition result | Both search implementations need the same public projection without changing provider selection |
| `packages/runner-pi/src/stream-converter.ts` | `extractToolResultText` flattens results; only question answers have a structured-output special case | Structured search metadata must be selected before text fallback |
| `packages/runner-codex/src/codex-runner.ts` | Completed web search exposes only `{query}` | No source list or answer ranges can be reconstructed honestly |
| Installed `@earendil-works/pi-ai` | `TextContent` has text/textSignature, no annotations; `api/openai-responses-shared.js` copies output text and signatures without carrying annotations | The current Pi runtime cannot advertise native Responses annotation support |
| `packages/sdk/src/provider/bunny-agent-language-model.ts` | Text-end metadata and source events are not mapped; `doGenerate` accumulates text without per-part metadata and omits source/tool-result collection | Streaming and generate mappings both require explicit preservation |
| kapps `SandAgentProvider` | Already calls `toUIMessageStream({sendSources:true})` | The SDK can use existing AI SDK source transport |
| kapps `content-part-renderer.tsx` | Source URL/document parts render as text labels, with no answer-range handling | Backend protocol delivery alone does not complete clickable inline citation UX |

The reference is the [OpenAI Responses web search guide](https://developers.openai.com/api/docs/guides/tools-web-search?api-mode=responses), particularly its separate `web_search_call.action.sources` and `message.content[].annotations` outputs. Its character-position description does not establish a universal JavaScript UTF-16 convention; Bunny therefore documents its own offset unit rather than guessing.

## Goals / Non-Goals

**Goals:**

- Use Responses field names and the exact flat URL annotation shape as the primary answer citation contract.
- Preserve typed retrieval data and source identity from actual providers to public SDK messages.
- Produce real answer-position annotations for Pi/Tavily tools using explicit model references, with provenance distinct from native annotations.
- Make offset conversion, streaming finalization, session restoration, version selection, and failure transport testable.
- Keep legacy default behavior operational while applications explicitly migrate to v1.

**Non-Goals:**

- Add OpenAI hosted search, replace current search providers, or claim that Tavily itself generates answer annotations.
- Patch installed dependencies in `node_modules` or silently replace Pi's model execution engine to obtain native annotations.
- Implement Buda UI/database changes in this repository, relabel PR #8009 as annotations support, or fabricate `source-document` records from web pages.
- Infer factual support from arbitrary links, rank citations by truthfulness, or guarantee that a model's cited claim is correct.

## Decisions

### 1. Publish a versioned contract with explicit selection

Use `searchContractVersion?: 1` in SDK options, manager runner specification, and coding-run bodies, with CLI spelling `--search-contract-version 1`. Carry it as request data, never a process-global environment switch. Add the field to the existing option/body forwarding paths in SDK, manager, runner harness, `packages/server-ai-sdk`, daemon, and CLI.

A `start`/message-metadata acknowledgement reports effective version and separate capabilities for structured retrieval, native annotations, and explicit-source-marker annotations. Pi supports v1 structured search and the explicit bridge. Codex supports a v1 query-only envelope with unavailable detail and no citation capability. Other runners reject explicit v1 selection until adapted; their unspecified-version behavior remains unchanged. An older daemon/CLI that cannot acknowledge the contract is not silently treated as v1; the SDK surfaces an unsupported-contract error without automatic retry.

Alternative: change all default tool outputs immediately. Rejected because existing text consumers, third-party clients, and PR #8009 do not yet understand the new envelope. Version selection is the migration boundary, while structured data is authoritative whenever v1 is selected.

### 2. Use separate retrieval and answer contracts

Add public shared types, validation, and projection helpers under a browser-safe contracts subpath in `packages/manager`, which is already a dependency of runner harness, Pi, and SDK. Re-export the pure contract surface through `@bunny-agent/sdk/contracts`; keep Node-specific source hashing and orchestration outside that entry. This reuses existing dependency edges and lets Buda validate/project messages without importing server-only manager code. Keep provider adapters and tool execution in their current packages.

Illustrative retrieval envelope (source IDs are opaque; the example uses a readable fixture ID):

```json
{
  "schema_version": 1,
  "type": "web_search_call",
  "id": "call_search_1",
  "status": "completed",
  "action": {
    "type": "search",
    "query": "example documentation",
    "sources": [
      {
        "type": "url",
        "source_id": "src_docs",
        "url": "https://example.com/docs",
        "title": "Documentation"
      }
    ]
  },
  "source_details": "available",
  "results": [
    {
      "source_id": "src_docs",
      "url": "https://example.com/docs",
      "title": "Documentation",
      "snippet": "A readable description."
    }
  ],
  "provider": "tavily",
  "truncated": false
}
```

`schema_version`, `source_id`, `source_details`, `results`, `provider`, and `truncated` are Bunny extensions. The record is Responses-aligned, not an assertion that the OpenAI API accepts this object. Its `id` is the local actual tool-call ID, not the Tavily request ID; runner boundaries bind it from execution context, including when consuming a recognized structured tool-ref response.

The corresponding answer contract is independently projected from a finalized text part:

```json
{
  "type": "output_text",
  "text": "The guide describes this.[1]",
  "annotations": [
    {
      "type": "url_citation",
      "start_index": 25,
      "end_index": 28,
      "url": "https://example.com/docs",
      "title": "Documentation"
    }
  ]
}
```

The example range `[25,28)` covers exactly `[1]` in the literal string above. Canonical examples must also be validated as implementation fixtures. Provenance and source IDs remain outside the annotation object. A complete search with zero hits has available detail and empty arrays; query-only Codex has unavailable detail. Neither case creates answer annotations.

Alternative: put `output_text.annotations` into the search result at search execution time. Rejected because the final answer does not yet exist, so answer positions would be fabricated or refer to snippets.

### 3. Retain model-readable content and carry structured data in tool details

In v1 mode, both native Pi and harness search tools return readable content plus `details.web_search` containing the validated envelope; retain `details.usage` unchanged. Readable result entries include opaque source IDs and a concise instruction that references require explicit citation tokens. Optional fetched content stays separate from snippets and metadata.

The Pi converter selects the recognized, validated structured record before calling its existing text fallback. Other tool names, AskUserQuestion behavior, and unrecognized result shapes remain unaffected. Typed metadata, not text heuristics, determines v1 failure status.

For failure, emit `tool-output-error` with a sanitized error string and `providerMetadata["bunny-agent"].search_result` containing the structured failed envelope. The SDK maps this to a V3 tool result with `isError: true` and preserved metadata. AI SDK already retains provider metadata on an `output-error` UI part; do not assume an error part has an `output` field. Successful records remain the actual `output` object.

Use safe error codes such as `authentication`, `rate_limit`, `network`, `invalid_request`, and `provider_error`, without raw authorization headers, keys, or unsanitized request dumps. Preserve existing fallback rules and record the provider that actually succeeded.

### 4. Use stable source IDs and durable registry entries

Assign IDs deterministically from a validated URL serialization, using a collision-resistant full URL hash and a `src_` prefix. Preserve path, query, and fragment; do not strip tracking parameters or rewrite URLs into false equivalence. Tool-call provenance is stored separately so repeated URLs retain one identity across searches. Native citations may introduce sources absent from retrieval details; register these from validated provider metadata.

Restore Pi registry state from versioned session custom entries using the supported `SessionManager.appendCustomEntry`/entry-read APIs. Tool result details provide a second reconstruction source. Persist minimal source identity/title/provenance data, not page content or credentials. Restore only entries reachable on the resumed/forked branch; avoid importing future or sibling-branch sources from the entire session tree. Forked sessions retain identities inherited from their source branch. Compaction must not silently make already persisted identities depend on a live process map.

This internal registry serves generation; final UI messages contain all metadata required for their own replay. Consumer display must not require an RPC to the registry. Limit prompt additions to relevant current sources rather than injecting an entire historical registry.

### 5. Prefer native annotations, with an honest baseline capability

Define a typed native-annotation ingestion boundary that accepts text identity, provider annotation data, and a declared provider offset unit. It validates flat Responses annotations, registers safe provider sources, converts offsets when necessary, and records `origin: "provider"`. Native valid annotations take precedence for that text part; do not also rewrite citation tokens in the same part, which could invalidate native ranges.

The current Pi AI adapter has no exposed annotations, so this change must report `native_annotations: false` for that adapter. Codex likewise cannot claim native citation support based on its current event types. Native ingestion/transport is verified with explicit recorded fixtures at the runner contract boundary. A later supported upstream adapter extension/release can enable the native capability only after an actual end-to-end native-provider test; do not modify dependency code or advertise a live native path in this change.

This is a resolved scope boundary, not an investigation left to implementation. The user-prioritized Responses annotation format is implemented as the public contract now; native OpenAI-hosted search enablement remains outside scope.

Alternative: synthesize annotations by scanning Markdown links. Rejected because it does not establish that the answer cited a retrieved source and misrepresents provenance.

### 6. Bridge non-native tools using explicit source markers

For Pi's supported v1 tool path, instruct the model to emit `[[cite:<source_id>]]` immediately following a supported statement. A bounded incremental tokenizer operates only on assistant answer text, never tool output or reasoning. Resolve valid IDs to the source registry, replace each token with a visible `[n]`, and produce an annotation spanning exactly that emitted marker. Numbers are stable by first reference within the assistant message and reused across that message's text parts.

Unknown/malformed tokens and escaped or literal-code examples remain literal text and create no annotation. Track Markdown code/escape state across chunk boundaries conservatively; an unterminated code delimiter does not justify converting literal examples into citations. Duplicate complete events are ignored by text identity and terminal state. The marker protocol is an internal model-facing mechanism; clients receive the standard annotation object plus `origin: "explicit_source_marker"`. The bridge is not semantic fact checking. A model that emits no valid references produces no annotations, even if it used web search.

Streaming native and marker modes must be selected before the first visible delta for a text part. A native-capable adapter selects native mode and never applies marker rewrites, even if that particular answer ultimately has no native annotations. A marker-mode adapter must not inject late native annotations against the pre-rewrite text. Buffer only a possible token suffix, emit completed ordinary text continuously, and compute ranges against emitted text. On abort, flush incomplete token text literally and finalize only valid ranges over text actually emitted.

Alternative: buffer and rewrite an entire answer after generation. Rejected because it would delay output and make streamed text disagree with final offsets.

### 7. Define offsets and metadata projection precisely

Bunny v1 uses Unicode code-point offsets with exclusive end positions in exact emitted Markdown text, before Markdown rendering. Do not normalize Unicode, line endings, whitespace, or links after assigning ranges. JavaScript consumers use a tested code-point-to-UTF-16 conversion when slicing or mapping Markdown AST positions. For `A😀B [1]`, the marker is code-point range `[4,7)` and UTF-16 range `[5,8)`. A native adapter with unknown offset semantics cannot enable native annotations.

Attach terminal metadata on the matching runner `text-end` event:

```json
{
  "type": "text-end",
  "id": "text_1",
  "providerMetadata": {
    "bunny-agent": {
      "citation_contract": {
        "schema_version": 1,
        "offset_unit": "unicode-code-points",
        "annotations": [],
        "bindings": [],
        "processing": "complete"
      }
    }
  }
}
```

Each binding links `annotation_index` to `source_id`, `origin`, and known tool-call IDs. Empty arrays are valid, not evidence that sources were unavailable. `processing` is `complete` or `partial`; sanitized diagnostics explain invalid native annotations and processing limits. Merge metadata with existing `sessionId` and other provider fields.

The SDK maps runner URL-source chunks to V3 `{type:"source",sourceType:"url",id,url,title}`. AI SDK then creates `source-url` UI parts with the same `sourceId`. Emit these only for actual validated citations, deduplicated across the message, before final text metadata. Search results retain the entire retrieved-source list. Do not emit `source-document` for a URL simply because full text was fetched.

Update SDK `doStream`, `doGenerate`, and public output-text projection helpers. Generate results must retain per-text metadata, tool results, and URL sources instead of collecting only plain text. Final UIMessage JSON, not a transient custom data event, is the durable consumer contract.

### 8. Publish bounded processing and explicit truncation

Initial v1 limits: 50 validated source entries per search record; 500 distinct sources registered per answer turn; 1,000 annotations per text part; 256,000 Unicode code points per text part for citation tracking; and a 128-character pending marker suffix. The normal tool count semantics remain unchanged (default 5, advertised max 20); the 50-entry ceiling protects imported/native records.

Reject or truncate only the affected metadata with an explicit diagnostic. Preserve emitted text and valid existing annotations. Once a text part exceeds its annotation budget, forward remaining text literally and report partial processing rather than attempting unbounded rewriting. A turn registry budget is separate from persisted historical IDs: restoring history must not erase identities, and only a bounded current-turn view is used for citation resolution/prompt exposure. Never silently create an empty successful search because validation or a limit removed data.

Alternative: trust all upstream data or concatenate whole page text into citation metadata. Rejected due to memory, prompt injection, and incorrect offset risks.

## Risks / Trade-offs

- [Current native annotations are lost inside the Pi dependency] → Preserve honest capability flags; implement/test the native contract boundary without claiming a live native OpenAI integration; require a separate upstream-enabled follow-up.
- [Explicit markers add model-facing syntax and may be omitted or copied incorrectly] → Resolve only known IDs, test malformed/unknown markers, expose generated provenance, and never use Markdown links as a substitute.
- [Native metadata can arrive after text] → Select native versus marker mode before text emission; finalize native metadata at text-end without rewriting text.
- [Source records span search calls, compaction, forks, and process restarts] → Use deterministic IDs and versioned branch-aware session entries; test fresh-process reconstruction.
- [Unicode and Markdown rendering use different coordinate systems] → Freeze exact raw text and documented code-point ranges; provide tested conversion helpers and a downstream AST handoff.
- [Structured errors can be flattened by AI SDK error handling] → Preserve the failed envelope in supported provider metadata and test a real UIMessage `output-error` part.
- [v1 output is not directly handled by PR #8009] → Keep default legacy mode until a separate Buda consumer change supports structured-first parsing and annotations.
- [Safe URL validation does not prove a cited statement] → Describe provenance and model authorship accurately; do not claim semantic verification.

## Migration Plan

1. Land public types/validators, SDK request forwarding, and runner version acknowledgements with legacy defaults unchanged.
2. Enable Pi/harness structured search and Codex unavailable-detail envelopes in explicitly selected v1 requests. Implement and test failure preservation and usage compatibility.
3. Enable the Pi explicit-reference bridge and native ingestion fixture boundary, then implement SDK stream/generate/UIMessage parity and branch-aware session restoration.
4. Run scoped affected tests and local daemon/CLI integration. Perform a real Tavily model/tool/SDK run using credentials supplied at execution time; prior search-card tests do not count as evidence for the new annotations protocol.
5. Publish valid protocol examples and SDK fixtures for the downstream Buda change. That follow-up owns structured-first card parsing, clickable answer-range rendering, database persistence, reload/fork testing, and Cloud/OpenBuda UI evidence.
6. Keep opt-in status until the consumer handoff is implemented and independently verified. Changing defaults or retiring legacy text requires a later versioned release decision.

The verified v1 UIMessage compatibility baseline is stable `ai >=6.0.264 <7.0.0` with packaged `@ai-sdk/react ^3.0.267`. Older releases such as `ai@6.0.105` discard tool-result metadata. V1 checks the actual consumer peer version before execution and rejects unsupported peers; unspecified-version calls retain the existing `^6.0.0` peer range. Failed tool envelopes survive final UIMessage serialization in `resultProviderMetadata["bunny-agent"].search_result`.

Rollback: remove `searchContractVersion` from affected callers to restore the legacy path. Retain persisted versioned metadata and source IDs for already completed messages; rollback must not delete historical citations or require rewriting message text.
