# Document citations (`document_citations` v1)

This independent BunnyAgent extension binds an answer span to an actual,
allowlisted MCP document read. It does not change `searchContractVersion: 1`
or claim to be an OpenAI `file_citation`. Native AI SDK `source-document`
parts carry durable receipts; documents do not need public URLs.

## Trusted producer configuration

A trusted server integration opts in with per-server `documentReadTools`:

```ts
const provider = createBunnyAgent({
  sandbox,
  daemonUrl: "http://127.0.0.1:3080",
  runnerType: "pi",
  allowedTools: ["mcp"],
  mcpConfig: {
    mcpServers: {
      documents: {
        url: "https://mcp.example.com/rpc",
        documentReadTools: ["read_document"],
        excludeTools: ["resolve_document_source"],
      },
    },
    settings: { hostConfigDiscovery: "off" },
  },
});
```

This is a server integration capability, not an end-user feature flag. Server
names and read-tool allowlists are trusted configuration, never model inputs.
The Pi MCP bridge strips this Bunny-only configuration before creating the
adapter. It accepts only successful executed callbacks with adapter-owned
server/tool identity and `mcpResult.structuredContent`; it injects the actual
callback tool-call ID. Shell output, JSON embedded in text, unconfigured tools,
failed reads, and mismatched excerpt hashes never create trusted citations.

For servers that expose a temporary-URL resolver, exclude that tool from model
execution. The adapter enforces exclusions on proxy calls as well as discovery
and direct tools. A product backend can use its independent authenticated MCP
client after checking the saved session and source permissions. Temporary URLs
must not be placed in document identities, tool history, or citation metadata.

## Read envelope

Return this object under MCP `structuredContent["bunny-agent"].document_read`:

```ts
const read: DocumentReadResult = {
  schema_version: 1,
  type: "document_read_result",
  document: {
    provider: "example",
    namespace: "space-id",
    collection: "drive-id",
    document_id: "asset-id",
    path: "/reports/report.pdf",
    title: "Report",
    media_type: "application/pdf",
    version: "upstream-version",
    content_hash: "sha256:<64 lowercase hex digits>",
  },
  excerpts: [{
    locator: { type: "lines", start_line: 10, end_line: 11 },
    text: "First exact line\nSecond exact line",
    excerpt_hash: "sha256:<64 lowercase hex digits>",
  }],
};
```

`content_hash` is SHA-256 of the original canonical asset bytes (for example,
PDF binary bytes). It is **not** a hash of extracted text. `version` must be a
real upstream version or content hash. Missing original content identity means
return ordinary read text without a citation envelope.

Locators contain genuine, one-based inclusive lines of the extracted text for
that document version. `text` contains those exact lines normalized to LF,
without an added separator. `excerpt_hash` is SHA-256 of that UTF-8 string.
The runtime verifies its hash and line count. It does not download or hash the
entire document and cannot independently prove a producer's asset hash or line
mapping. The configured producer owns those assertions. Never infer PDF page
numbers from extracted lines.

The parser rejects unknown envelope/identity/locator/excerpt fields. A read
allows at most 50 excerpts and 32,768 UTF-16 code units per excerpt. Unknown
or oversized evidence fails closed while ordinary tool text remains usable.

## Identity, model references, and provenance

Server-only helpers live at `@bunny-agent/manager/contracts/document-id`:
`hashDocumentText`, `deriveDocumentKey`, `deriveDocumentSourceId`,
`validateDocumentReadResult`, and `documentSourcesFromRead`.

- `document_key` hashes provider, namespace, collection, document ID, version,
  and original asset content hash. Renaming presentation labels does not
  change identity.
- `source_id` hashes that document key, actual line locator, and excerpt hash.
  Separate reads of different spans retain separate receipts. Changed
  extraction changes the receipt even when the PDF binary is unchanged.
- `mcp_server` comes only from the executing adapter callback. The runtime
  attaches actual tool-call IDs to annotation bindings; producers cannot
  supply those IDs.
- Model-facing text and continuation guidance use only exact compact
  `ref_<12hex>` references in `[[cite:ref_<12hex>]]` markers. Canonical SHA-256
  IDs remain in wire metadata. Unknown, ambiguous, or mistyped references
  never become trusted annotations. No fuzzy matching is used.

URL and document references share one streaming Markdown-aware scanner and
one visible numbering map. Code, escaped markers, and links keep their
existing behavior. Neither contract consumes another contract's markers.

The request-scoped registry persists versioned custom session entries and
captures the initial reachable leaf. Resume, fork, and compaction resolve only
that ancestry plus the current turn, excluding siblings and future entries.
Restoration also requires the source's configured trusted MCP server. It
retains at most 500 cached receipts; recent prompt guidance includes at most
20 references, with older reachable references resolved lazily. This provenance
proves a read happened; it does not prove an answer's factual interpretation.

## Runtime negotiation and stream contract

A capable daemon advertises `data.capabilities.documentCitations.version: 1`
in `/healthz`. With any `documentReadTools` configured, the SDK automatically
discovers support through the attached sandbox's existing exec transport.
Healthy older daemons omit the capability: the SDK removes only
`documentReadTools` before its single coding-run request. Other MCP settings
remain unchanged. Non-Pi and CLI-only execution conservatively remove the
field. There is no execute-and-retry or manual flag.

Discovery shares the existing bounded search capability cache: 30-second TTL,
handle identity plus actual sandbox ID and daemon URL, at most 16 entries per
handle, singleflight, and a four-second cancellation budget. Errors, malformed
health documents, and HTTP failures are not cached as old-runtime support.
An in-place restart can remain cached for up to 30 seconds. The coding request
uses the same handle that was probed.

Pi acknowledges an active trusted document integration with
`messageMetadata.documentCitations: { version: 1 }`. The SDK requires that
actual acknowledgement, configured server identity, a matching source event,
and valid per-text metadata before emitting native document source parts.
Unacknowledged document metadata is removed. Negotiated document citations
require the verified AI SDK metadata baseline `ai >=6.0.264 <7.0.0`; an older
peer is rejected before coding execution. A healthy old daemon that does not
support documents keeps legacy execution without this additional peer gate.

Final text metadata is independent of the web search contract:

```ts
providerMetadata["bunny-agent"].document_citations = {
  schema_version: 1,
  offset_unit: "unicode-code-points",
  annotations: [{
    type: "document_citation",
    start_index: 12,
    end_index: 15,
    source_id: "src_<64 lowercase hex digits>",
    title: "Report",
  }],
  bindings: [{
    annotation_index: 0,
    source_id: "src_<64 lowercase hex digits>",
    origin: "explicit_source_marker",
    tool_call_ids: ["actual-executed-read-id"],
  }],
  sources: [receipt], // DocumentCitationSource; no excerpt text or URL
  processing: "complete",
};
```

Offsets count Unicode code points in the emitted text, including visible
`[n]` markers; they are not JavaScript UTF-16 indices. Native source-document
parts store `providerMetadata["bunny-agent"].document_source = receipt` and
survive ordinary AI SDK UIMessage JSON persistence. Use
`toUIMessageStream({ sendSources: true })` to include them.

Browser-safe types and validators are exported from
`@bunny-agent/sdk/contracts`, including `DocumentReadResult`,
`DocumentCitationSource`, `DocumentCitationContractMetadata`,
`isDocumentCitationSource`, `isValidDocumentCitationContractMetadata`, and
`projectUIMessageDocumentCitations`. The projection requires a durable text
part ID, an actual acknowledgement, and valid Unicode ranges. It rejects
malformed recognized v1 metadata instead of inventing a citation.

Product consumers own storage, access control, click resolution, and document
preview. Recheck current access, document version/content hash, and the exact
excerpt hash before presenting an asserted current line range. Obtain any
temporary download URL only at click time; never persist it with the receipt.
