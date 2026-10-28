## Purpose

Provide a versioned, machine-readable web search result contract that preserves source identity and distinguishes retrieved sources, unavailable detail, and failures without requiring provider-specific text parsing.

## ADDED Requirements

### Requirement: Explicit opt-in and canonical output precedence
The system SHALL support an explicit `searchContractVersion: 1` request while retaining legacy behavior when the option is absent. A recognized and valid v1 structured result SHALL take precedence over its model-readable text representation. A malformed recognized v1 payload SHALL produce a protocol diagnostic rather than silently substituting parsed legacy text. An unsupported requested version SHALL be rejected explicitly.

#### Scenario: Existing caller
- **WHEN** a caller does not request a search contract version
- **THEN** the existing search arguments and text output behavior SHALL remain unchanged

#### Scenario: Structured and text representations disagree
- **WHEN** a valid v1 structured result and a different legacy text source list are both present
- **THEN** the structured source list SHALL be authoritative for v1 consumers

#### Scenario: Unsupported version
- **WHEN** a caller requests a version not supported by the runner
- **THEN** the request SHALL return an explicit unsupported-contract error rather than claiming v1 support

### Requirement: Responses-aligned retrieval envelope
A v1 search result SHALL contain `schema_version: 1`, `type: "web_search_call"`, the actual tool-call `id`, `status: "completed"` or `"failed"`, `action.type: "search"`, the executed `action.query`, `action.sources`, `results`, and `source_details: "available"` or `"unavailable"`. Each source SHALL contain `type: "url"`, `source_id`, `url`, and a title when known. Each detailed result SHALL identify its source and preserve available title, URL, snippet, age, and optional fetched content. Bunny-specific fields SHALL be documented as extensions rather than represented as exact OpenAI API compatibility.

#### Scenario: Tavily returns three results
- **WHEN** the provider successfully returns three valid web results
- **THEN** the completed envelope SHALL associate those results with three source entries and their actual tool-call ID
- **AND** neither answer text nor answer annotations SHALL be invented in the retrieval envelope

#### Scenario: Fetched content contains apparent result markers
- **WHEN** fetched page content contains strings resembling source fields or result separators
- **THEN** those strings SHALL remain page content and SHALL NOT create additional sources

### Requirement: Stable and distinct source identities
The system SHALL assign a stable opaque `source_id` to each validated URL and reuse it for the same URL throughout a conversation, replay, and resume. Different query strings or fragments SHALL remain distinct identities unless an explicitly versioned equivalence rule says otherwise. Titles and result ordering SHALL NOT determine source identity. The system SHALL retain the association among source IDs, originating tool calls, and actual URLs.

#### Scenario: Repeated searches return one URL with different titles
- **WHEN** successive searches return the same validated URL under different titles or positions
- **THEN** that URL SHALL retain its source ID and its association with both search calls

#### Scenario: Distinct URLs
- **WHEN** two results have different query strings or fragments
- **THEN** the results SHALL NOT be silently merged into one source

### Requirement: Empty results differ from unavailable results
A successful search with a confirmed empty result set SHALL return `source_details: "available"`, an empty `results` array, and an empty `action.sources` array. A runner that supplies only a query SHALL return `source_details: "unavailable"` and SHALL NOT represent its result as a confirmed zero-hit search.

#### Scenario: Confirmed empty Tavily response
- **WHEN** Tavily returns a valid empty result array
- **THEN** v1 output SHALL represent a completed search with available detail and zero sources

#### Scenario: Query-only Codex completion
- **WHEN** the runner reports a search query without result details
- **THEN** v1 output SHALL explicitly identify unavailable detail rather than assert no results were found

### Requirement: Structured provider failures
A failed search SHALL return `status: "failed"`, no purported successful results, and a sanitized error containing `code`, `message`, and `retryable`. Failures SHALL be observable as tool errors in v1 transports, and the structured failure envelope SHALL remain available alongside the human-readable error. An authentication failure SHALL NOT be reclassified as empty results or retried against another provider merely to hide the failure.

#### Scenario: Tavily authentication failure
- **WHEN** Tavily rejects a request with HTTP 401
- **THEN** the result SHALL identify an authentication error without exposing the key and without reporting an empty successful search

#### Scenario: Recoverable provider failure
- **WHEN** an existing fallback policy successfully handles a rate-limit or network failure using another configured provider
- **THEN** the final result SHALL identify the actual successful provider and results

### Requirement: Safe and bounded result metadata
Source URLs SHALL be absolute HTTP(S) URLs without embedded user credentials. Titles and snippets SHALL remain untrusted plain text. The contract SHALL publish processing limits and explicit truncation indicators; reaching a limit SHALL NOT fabricate zero results or silently change source identities. Provider credentials and authorization headers SHALL NOT appear in public results, errors, examples, or fixtures.

#### Scenario: Unsafe source URL
- **WHEN** a provider returns a script URL or a URL containing embedded credentials
- **THEN** it SHALL NOT become a usable source or a citation target

#### Scenario: Source budget exceeded
- **WHEN** a provider returns more sources than the published v1 limit
- **THEN** the response SHALL retain the permitted valid sources and explicitly report truncation

### Requirement: Preserve legacy readability and existing usage accounting
Structured mode SHALL retain a readable tool result for the model, including source IDs that can be explicitly referenced. Adding the structured contract SHALL NOT discard existing usage accounting, optional fetched page content, or the original safe result text. Raw inspection SHALL remain possible without reparsing display snippets.

#### Scenario: Structured search with usage details
- **WHEN** a successful result contains existing request/fetched-page usage data
- **THEN** both structured result metadata and usage data SHALL survive the search tool boundary
