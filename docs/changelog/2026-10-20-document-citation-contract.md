# Trusted document read receipts and citations

Date: 2026-10-20

## Decision

- Add an independent `document_citations` v1 contract with durable original
  document identity, actual line locators, exact excerpt hashes, configured MCP
  server identity, and executed tool-call provenance. Keep web search v1 intact.
- Accept structured read receipts only through per-server `documentReadTools`
  and the real executing MCP adapter callback. Never trust shell/text JSON.
- Share the existing compact-reference scanner and numbering with web sources.
  Persist only versioned receipts and restore captured reachable ancestry.
- Automatically negotiate daemon support before execution and strip the new
  configuration for healthy old runtimes. Require runtime acknowledgement and
  exact metadata before projecting native AI SDK source-document parts.
- Check the verified AI SDK metadata-persistence baseline after document
  capability negotiation, before coding execution. Healthy old daemons keep
  their legacy peer compatibility after the new configuration is stripped.
- Keep temporary URL resolvers out of model tool access. Leave authenticated
  source resolution and presentation to the product consumer.

## Why

A document citation needs stable file/version identity and genuine read
locators. Public URLs and model-authored path labels do not establish that
provenance. Separate original asset and excerpt hashes bind a bounded read
without downloading or hashing the entire extracted text.

## Supersedes

No existing web contract or ordinary MCP behavior. Document capability is
opted into by trusted server integration configuration, not an end-user flag.

## Acceptance

Tests cover document/receipt hash identity, invalid evidence rejection, Unicode
mixed web/document marker processing, real session resume/fork/compaction,
real MCP HTTP reads and excluded resolver calls in proxy/direct configurations,
automatic old/new daemon negotiation, and real AI SDK UIMessage persistence.
The full Pi suite passes 26 files / 337 tests with one worker. An initial
concurrent build/test run timed out in two HTTP integration tests; the full
serial rerun passes. The SDK suite passes 15 files / 139 tests, and the manager contract
passes 10 tests. Pi and SDK typechecks, a browser-platform contracts bundle,
Biome on all changed TypeScript/package files, and the SDK/daemon dependency
build graph pass. A private actual producer receipt also passes hash validation,
registry registration, stream conversion, native AI SDK source-document JSON
persistence, and durable projection without a temporary download URL. This
controlled handoff is separate from product browser acceptance.
