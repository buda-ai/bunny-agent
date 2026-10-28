# Search and citation contract proposal

Date: 2026-10-16
Baseline: main@38c228c (v0.9.62)
Status: Planning complete; runtime implementation has not started.

## Request

Prioritize the OpenAI Responses `output_text.annotations[].url_citation` convention when updating the BunnyAgent search tool contract. Use the OpenSpec propose workflow and distinguish answer-level citations from search source cards.

## Planning work

- Initialized a local OpenSpec root in the isolated verification worktree after the user explicitly approved initialization.
- Created `openspec/changes/standardize-search-tool-citation-contract/` with a proposal, technical design, three capability specifications, and an implementation checklist.
- Grounded the design in current search tools, Pi stream conversion, Codex query-only output, SDK stream/generate handling, installed Pi provider types, and the downstream Buda source renderer.
- Defined opt-in structured retrieval, Responses-shaped answer annotations, explicit source-reference generation, native capability limitations, stable identities, Unicode offset semantics, session/replay transport, migration, and Buda consumer handoff.
- Recorded that the current Pi dependency drops native annotations. Native live support is not claimed or enabled by this plan; backend contract delivery does not imply completed Buda inline rendering or persistence.
- Retained planning-only scope. No runtime source edits, implementation delegation, provider requests, publication, merge, or deployment were performed in this workflow.

## Validation

- `openspec validate standardize-search-tool-citation-contract --strict` passed.
- OpenSpec status reports all four artifact categories complete: proposal, specs, design, and tasks.
- Protocol JSON examples and illustrative citation offsets were checked for consistency. Implementation tasks remain unchecked.
