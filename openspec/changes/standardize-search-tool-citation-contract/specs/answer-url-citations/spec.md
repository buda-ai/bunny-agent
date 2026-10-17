## Purpose

Represent answer-level web citations using the OpenAI Responses output-text annotation convention, with trustworthy source associations and precisely defined positions in the emitted answer text.

## ADDED Requirements

### Requirement: Responses-shaped answer content
A citation-capable answer text part SHALL project to `{ "type": "output_text", "text": string, "annotations": [...] }`. Each supported annotation SHALL use the flat Responses shape with `type: "url_citation"`, `start_index`, `end_index`, `url`, and `title`. Source identity and provenance extensions SHALL be carried outside this canonical annotation object. A web search result list SHALL NOT substitute for answer annotations.

#### Scenario: Answer cites a retrieved document
- **WHEN** an answer explicitly cites one of several retrieved URLs
- **THEN** its output-text annotations SHALL describe that cited URL and its answer range
- **AND** unrelated retrieved URLs SHALL remain search sources rather than be automatically marked as cited

### Requirement: Exact text and offset semantics
Bunny v1 ranges SHALL use zero-based Unicode code-point offsets, inclusive `start_index` and exclusive `end_index`, in the exact emitted Markdown text of one identified text part. The transport SHALL declare `offset_unit: "unicode-code-points"`. Every annotation SHALL satisfy `0 <= start_index < end_index <= codePointLength(text)`. Offsets SHALL NOT refer to rendered HTML, reasoning, search snippets, or a concatenation of unrelated text parts.

#### Scenario: Astral characters precede a citation
- **WHEN** the emitted answer is `A😀B [1]` and the citation covers `[1]`
- **THEN** its canonical range SHALL be `[4, 7)` regardless of JavaScript UTF-16 storage length

#### Scenario: Several text parts
- **WHEN** an assistant produces multiple text parts separated by tools or reasoning
- **THEN** each annotation SHALL be bound to its own text identity and measured from that part's start

### Requirement: Prefer native annotations with declared offset conversion
When a provider adapter supplies native annotations and an identified offset convention, the system SHALL validate and preserve those annotations in preference to generating replacements. Conversion to Bunny offset units SHALL preserve the covered substring. An adapter whose offset units or annotations are unavailable SHALL report the native capability as unavailable rather than guess ranges or claim provider-native support.

#### Scenario: Valid native UTF-16 range
- **WHEN** an adapter supplies a native range `[5, 8)` over `[1]` in `A😀B [1]` and declares UTF-16 units
- **THEN** the emitted Bunny range SHALL be `[4, 7)` with native-provider provenance

#### Scenario: Native metadata lost upstream
- **WHEN** the provider library exposes only text and no annotation metadata
- **THEN** the system SHALL NOT claim that native annotations were preserved

### Requirement: Explicit source-reference bridge for non-native search tools
For citation-enabled Pi tool answers without usable native annotations, the system SHALL expose known source IDs to the model and resolve only assistant-authored `[[cite:<source_id>]]` tokens against that source registry. A valid token SHALL become a visible numbered reference such as `[1]`, with a canonical URL annotation covering that reference. Unknown or malformed tokens, escaped tokens, and tokens inside literal Markdown code contexts SHALL remain ordinary text without annotations. Repeated references to the same source SHALL reuse its number within the assistant message. Generated annotations SHALL declare explicit-source-marker provenance rather than native-provider provenance.

#### Scenario: Tavily result is explicitly cited
- **WHEN** a search registers source `src_docs` and the assistant emits `The guide describes this.[[cite:src_docs]]`
- **THEN** the final text SHALL contain `The guide describes this.[1]`
- **AND** a URL annotation SHALL cover exactly `[1]` and resolve to the registered source

#### Scenario: Unknown or malformed reference
- **WHEN** an assistant emits a token for an unknown source or a malformed token
- **THEN** it SHALL remain ordinary text without an invented URL annotation

#### Scenario: Literal citation syntax in code
- **WHEN** a known source token appears in an escaped example, inline code, or a fenced code block
- **THEN** its literal text SHALL remain unchanged and SHALL NOT generate an answer citation

#### Scenario: Marker in provider content
- **WHEN** a retrieved page contains citation-token syntax
- **THEN** it SHALL NOT generate answer annotations unless the assistant independently emits a valid source reference in its answer channel

### Requirement: Ordinary links do not imply structured citations
The system SHALL NOT generate annotations merely because answer text contains a Markdown link, a bare URL, a bibliography, or a link copied from a search snippet. Explicit native annotations or validated source-reference tokens SHALL be required for structured citation claims.

#### Scenario: Answer contains a Markdown link
- **WHEN** an answer contains `[Documentation](https://example.com/docs)` without native annotations or a valid explicit source token
- **THEN** it SHALL remain an ordinary link and SHALL NOT be reported as a structured citation

### Requirement: Validate targets, provenance, and duplicate ranges
Every emitted citation SHALL resolve to a safe HTTP(S) source identity. Native citations SHALL register their validated provider-supplied source even if the corresponding retrieval detail is unavailable. Invalid ranges, unsafe targets, and conflicting duplicate annotations SHALL be diagnosed without manufacturing corrected citations. Exact duplicate annotations SHALL be emitted only once; distinct valid sources on the same range SHALL retain separate associations.

#### Scenario: Provider cites an invalid range
- **WHEN** a native annotation ends beyond its text part or splits a surrogate pair before conversion
- **THEN** it SHALL be excluded from clickable citation metadata and reported as invalid

#### Scenario: Native source without exposed search details
- **WHEN** a provider supplies a valid native answer annotation but does not expose a result list
- **THEN** the answer citation SHALL remain valid and the separate search detail SHALL remain explicitly unavailable

### Requirement: Stream-safe finalization and bounded processing
Citation ranges SHALL remain correct for every input chunk partition, including tokens split across chunks and line endings or combining characters. Each text part SHALL finalize its annotations before its terminal event, without rewriting text already emitted to the client. Abort, truncation, or budget exhaustion SHALL NOT create dangling or out-of-bounds annotations and SHALL report partial processing when applicable.

#### Scenario: Token split across stream chunks
- **WHEN** a valid citation token arrives across arbitrary text-delta boundaries
- **THEN** the resulting text, source number, and annotation range SHALL equal the unsplit result

#### Scenario: Abort during a partial marker
- **WHEN** streaming aborts before a citation token is complete
- **THEN** the partial token SHALL be retained as ordinary text and SHALL NOT create a citation
- **AND** any retained earlier annotations SHALL refer only to text actually emitted
