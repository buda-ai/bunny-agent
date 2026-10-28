## Purpose

Carry versioned search results and answer URL annotations through BunnyAgent runner, daemon, and SDK boundaries without losing source identity, text positions, capabilities, or serialization fidelity.

## ADDED Requirements

### Requirement: Request-scoped contract selection
The selected contract version SHALL be carried through SDK, manager, daemon coding-run requests, and CLI fallback to the executing runner. It SHALL be request-scoped and SHALL NOT require a process-global switch or affect concurrent legacy requests. Responses SHALL explicitly acknowledge the effective version and citation capabilities. Unsupported runners or absent acknowledgements SHALL NOT be treated as successful v1 negotiation.

#### Scenario: Concurrent old and new callers
- **WHEN** one request selects v1 and another concurrent request uses the legacy default
- **THEN** their results SHALL follow their independently selected contracts

#### Scenario: CLI and daemon parity
- **WHEN** the same supported v1 request uses daemon HTTP or CLI fallback
- **THEN** both paths SHALL preserve the selected version and the same search/citation semantics

### Requirement: Structured tool result transport
Successful v1 searches SHALL preserve the structured envelope as tool output rather than flatten it to text. Failed v1 searches SHALL expose an error state, a sanitized error message, and the full structured failure envelope in documented provider metadata. Existing usage and unrelated provider metadata SHALL survive alongside the new fields.

#### Scenario: Search reaches an AI SDK UIMessage
- **WHEN** a successful v1 tool result passes through runner SSE, daemon HTTP, SDK, and AI SDK UI stream processing
- **THEN** its final tool part SHALL contain the same structured search fields and source identities

#### Scenario: Search failure reaches an AI SDK UIMessage
- **WHEN** a v1 search fails with HTTP 429
- **THEN** the final tool part SHALL be in the error state and preserve its structured failure metadata without requiring error-string parsing

### Requirement: Bind canonical annotations to text parts
Finalized annotations SHALL be attached to the matching text identity using documented terminal text-event provider metadata. SDK streaming and non-streaming APIs SHALL preserve that metadata and provide the same Responses-shaped output-text projection. Citation metadata SHALL merge with existing session and unrelated metadata rather than replace it.

#### Scenario: Text metadata crosses SDK conversion
- **WHEN** a runner closes an annotated text part
- **THEN** the SDK SHALL preserve its annotations, offset unit, source bindings, provenance, and existing session metadata

#### Scenario: Stream and generate APIs
- **WHEN** identical runner events are consumed using streaming and non-streaming SDK interfaces
- **THEN** the completed answer text and canonical annotations SHALL be equivalent

### Requirement: Native AI SDK URL source projection
Each URL actually cited by a validated answer annotation SHALL produce an AI SDK URL source with a stable source ID, safe URL, and available title. Repeated citations SHALL NOT duplicate the same source part. Retrieved but uncited results SHALL remain in search output rather than be projected as answer citation sources. Web results SHALL NOT be mislabeled as document sources.

#### Scenario: One URL cited repeatedly
- **WHEN** an answer cites the same source at several text ranges
- **THEN** the answer SHALL retain every valid range and emit one URL source identity

#### Scenario: Retrieved result is not cited
- **WHEN** a search retrieves three sources but the assistant cites only one
- **THEN** only the cited source SHALL be projected as an answer URL source

### Requirement: Replay and persistence-safe public data
JSON serialization and rehydration of final UI messages SHALL preserve text, annotations, source IDs, ranges, and provenance without relying on a transient side channel or a live process registry. Replaying recorded events SHALL NOT duplicate citations. Resume SHALL restore source identity from persisted structured data rather than recompute associations from display text.

#### Scenario: Message reload
- **WHEN** a completed annotated UIMessage is serialized and rehydrated in a new process
- **THEN** its canonical output-text projection and source associations SHALL be unchanged

#### Scenario: Repeated terminal event
- **WHEN** a recorded terminal text or source event is replayed more than once
- **THEN** the reconstructed message SHALL NOT acquire duplicate annotations or URL sources

### Requirement: Honest capability and diagnostic reporting
The acknowledged contract SHALL separately report structured retrieval, native answer annotations, and explicit-source-marker annotations as supported or unsupported. Query-only Codex output SHALL NOT imply source or citation support. Invalid annotations and bounded-processing limits SHALL produce sanitized diagnostics without leaking provider secrets or invalidating unrelated valid text.

#### Scenario: Current Pi model adapter
- **WHEN** the model adapter exposes text without native annotations but the explicit source bridge is available
- **THEN** capabilities SHALL report native annotations as unsupported and explicit-source-marker annotations as supported

#### Scenario: Current query-only Codex adapter
- **WHEN** Codex exposes only the search query and no answer citation metadata
- **THEN** capabilities and outputs SHALL identify unavailable source details and unsupported answer annotations

### Requirement: Consumer handoff is explicit
The published protocol SHALL include valid examples and a consumer conformance checklist covering structured-first search parsing, inline rendering against original text, safe links, persistence, and offset conversion for JavaScript clients. Backend conformance SHALL NOT be presented as proof that Buda Cloud/OpenBuda already implement inline citations or database persistence.

#### Scenario: Backend tests pass
- **WHEN** BunnyAgent protocol tests pass but downstream Buda consumers remain unchanged
- **THEN** the acceptance report SHALL distinguish backend protocol conformance from pending product rendering and persistence work
