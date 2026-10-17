## 1. Public contract and projection helpers

- [x] 1.1 Add browser-safe v1 retrieval, URL annotation, source-binding, capability, and diagnostic types/validators to a dedicated manager contracts subpath; verify valid completed/failed/query-only examples and rejection of malformed versions with focused tests.
- [x] 1.2 Add pure output-text projection and Unicode code-point/UTF-16 conversion helpers; verify `A😀B [1]`, combining characters, CRLF, invalid boundaries, and the design's literal `[25,28)` example with focused tests.
- [x] 1.3 Implement server-only stable URL source identity generation with documented URL validation and limits; verify repeated URLs retain IDs, distinct query/fragment URLs remain distinct, unsafe URLs are excluded, and all-invalid provider output does not become a false zero-hit result.
- [x] 1.4 Publish manager/SDK contracts subpath exports without importing server orchestration or Node hashing into browser code; verify built package exports, TypeScript imports, and a minimal browser bundling check.


## 2. Request version selection and capabilities

- [x] 2.1 Forward `searchContractVersion` through SDK options, manager runner specification, and coding-run request construction; verify daemon bodies and CLI argument construction preserve v1 while unspecified requests remain unchanged.
- [x] 2.2 Parse and validate version selection in runner CLI, server-ai-sdk coding-run handling, daemon forwarding, and harness dispatch; verify unsupported versions/runners fail clearly and concurrent legacy/v1 requests remain isolated.
- [x] 2.3 Emit and preserve effective-version/capability acknowledgements and reject missing acknowledgements in explicitly selected v1 SDK calls without automatic retry; verify older-peer, Pi native-unavailable/bridge-supported, and Codex query-only cases.

## 3. Structured search tool results

- [x] 3.1 Update Pi Brave/Tavily search tools to retain readable content with source IDs plus `details.web_search`, preserving `details.usage` and optional content; verify success, zero hits, age/content retention, fallback provider identity, and legacy-mode output using existing web-tools tests.
- [x] 3.2 Update harness Brave/Tavily/DuckDuckGo search tools to use the same v1 projection and actual execution tool-call ID; verify equivalent provider data produces equivalent canonical results and fetched content cannot create metadata or sources.
- [x] 3.3 Produce sanitized structured failures for authentication, rate-limit, network, invalid-request, and malformed provider responses; verify failure state, error code/retryability, no secret leakage, and unchanged existing fallback policy.
- [x] 3.4 Prefer validated structured search details in Pi stream conversion and recognized structured tool-ref results, binding the local actual tool-call ID; verify conflicting legacy text does not override v1 data and unrelated tools/AskUserQuestion remain unchanged.
- [x] 3.5 Adapt Codex's existing query-only web-search completion to a v1 unavailable-detail envelope and truthful capabilities; verify it never reports confirmed zero hits or invented answer citations.

## 4. Source registry and explicit citation bridge

- [x] 4.1 Implement a request/session source registry and versioned Pi custom session entries; verify source IDs and provenance reconstruct after a fresh-process resume, compaction, and fork without importing sibling/future branch records.
- [x] 4.2 Add v1-only model-facing source reference guidance and bounded relevant-source exposure; verify legacy prompts remain unchanged and source content cannot inject trusted registry entries.
- [x] 4.3 Implement bounded incremental resolution of assistant-authored `[[cite:<source_id>]]` tokens into `[n]` and Responses-shaped annotations; verify valid, repeated, unknown, malformed, adjacent, escaped, inline-code, and fenced-code references and stable numbering across text parts.
- [x] 4.4 Verify marker resolution for every split position of representative tokens, Unicode/CRLF prefixes (including a surrogate pair split between input chunks), tools/reasoning boundaries, partial-token abort, and processing budgets; completion requires identical final text/ranges for unsplit and partitioned inputs.

## 5. Native ingestion and runner stream finalization

- [x] 5.1 Implement a typed native annotation validation/normalization boundary with explicit provider offset units and provenance; verify recorded flat Responses fixtures, unsafe targets, invalid ranges, duplicate ranges, and native sources absent from search details.
- [x] 5.2 Select native versus explicit-marker mode before emitting each text part; verify native-capable fixture paths never rewrite text and marker-mode paths cannot attach late annotations measured against pre-rewrite text. Keep current Pi/Codex native capability false; no dependency patch or live native claim is part of this task.
- [x] 5.3 Emit terminal per-text citation metadata and one URL source event per actually cited source, preserving existing text IDs and session metadata; verify uncited retrieval sources are excluded from answer source projection and web pages are not converted to document sources.
- [x] 5.4 Emit typed v1 tool errors with the structured failed envelope in provider metadata and retain usage accounting; verify Pi stream conversion does not flatten successful structures or lose failed search data.
- [x] 5.5 Finalize aborted/limited text safely and ignore duplicate terminal/source events; verify no dangling annotations, no duplicate sources, no changed previously emitted text, and explicit partial-processing diagnostics.

## 6. SDK stream, generate, and UIMessage parity

- [x] 6.1 Extend runner chunk types and SDK stream mapping for URL sources, structured tool output/errors, and terminal citation metadata; verify metadata merges preserve `sessionId` and unrelated provider fields through fragmented SSE.
- [x] 6.2 Update SDK `doGenerate` collection for per-text metadata, source parts, and tool results; verify canonical text/annotations and source/error structures match the streaming result for the same recorded runner events.
- [x] 6.3 Feed actual SDK streams through AI SDK UIMessage processing with sources enabled; verify source IDs, text annotation bindings, successful structured output, and `output-error` provider metadata without assuming an error output field.
- [x] 6.4 Serialize and rehydrate completed UI messages in a fresh process and replay repeated terminal/source events; verify output-text projections and associations are unchanged and independent of a live registry.

## 7. Cross-boundary verification

- [x] 7.1 Run an integration matrix through actual local daemon coding-run and CLI fallback using controlled provider HTTP responses; verify version forwarding, successful/empty/429/authentication states, citation ranges, legacy parity, and capability acknowledgements across both transports.
- [ ] 7.2 Run a fresh real Tavily/Pi/model -> daemon -> SDK -> UIMessage test with a runtime-supplied credential and explicit source-marker instructions; verify actual HTTP results match registered sources and emitted answer annotations resolve to exact substrings. Record model noncompliance as a failed acceptance run, never manufacture missing markers or reuse earlier source-card evidence.
- [x] 7.3 Run only affected package/file tests, scoped type checks, and formatting/diff checks; verify meaningful coverage for all three capability specs and separately report native fixture coverage, live Tavily coverage, and any downstream product gaps.

## 8. Documentation, handoff, and rollout

- [x] 8.1 Publish protocol and migration documentation with valid JSON examples, Bunny extension fields, Unicode units, provenance, limits, safe errors, version acknowledgements, legacy rollback, and runner support matrix; verify examples against contract validators.
- [x] 8.2 Deliver a Buda consumer conformance checklist and sanitized UIMessage fixtures covering structured-first source cards, clickable inline ranges in original Markdown, safe source links, metadata persistence, reload, and fork behavior; verify every checklist item maps to an explicit downstream acceptance test without editing kapps in this change.
- [x] 8.3 Record final scoped verification and API compatibility notes in the repository changelog and package release metadata as appropriate; verify no real key appears in code/fixtures/logs, no default-mode change is bundled, and PR #8009 is not claimed to implement answer annotations.
