# ACP process fidelity and interactive host gates

Date: 2026-10-26
Agent: Codex

## Request

Preserve the information visible in Buda when the agent is consumed through
ACP: execution steps, plans, rich tool results, media, citations, terminal
outcomes, and required user interaction. Verify protocol boundaries directly.

## Changes

- Preserve native ACP notifications across the compatibility SSE stream.
- Enrich tool category, title, locations, structured content, and original
  input/output; convert plan tools to complete ACP plan snapshots.
- Preserve resources, media, source identities, late citation metadata,
  nested attribution, and unknown display metadata.
- Emit negotiated version 1 lifecycle events from real provider boundaries;
  preserve reported usage and original ACP terminal reasons.
- Add real pre-execution host gates and structured question callbacks to
  supported runners. Pi honors an explicit host gate even when running as root.
- Share pending interactions across daemon connections, validate answers,
  and acknowledge idempotent retries after the waiting gate consumes a reply.
- Document capability support and the daemon/CLI build requirement.
- Add a standalone model-only development endpoint for the compiled daemon's
  real Pi runner and tools; native rejection receipts use the same selected
  option identity over standard and retryable delivery paths.

## Validation

Protocol tests use in-memory ACP, framed stdio, Streamable HTTP, and an actual
Node child process speaking native ACP. Scenarios cover rich-content round
trips, rejection, form answers, negotiation, wrong-session replies,
duplicate/conflicting decisions, cancellation, and modern plan updates.

Affected runner suites and scoped TypeScript checks run separately.
Deterministic protocol/runner fixtures do not establish live-provider
acceptance or remote deployment; the parent Buda/Busabase task records those
separate end-to-end results.

The compiled daemon was also driven against the local model endpoint using
actual filesystem read/write/edit, shell execution, an HTTP plan tool, and
real permission/input callbacks. That source-backed smoke observed six tool
authorizations, one structured form, two plan snapshots, eight provider
steps, seven completed tools, and the expected written file. The model was
deterministic; this is separate from the parent's actual Buda endpoint run.

Final independent verification (2026-10-27) passed 818 tests across 10 related
packages, the daemon dependency graph typechecks/build, and changed-file Biome.
The compiled daemon also passed the actual Buda → Busabase browser story in
56.9 seconds: real Pi file write/read/edit, four pre-execution approvals, a
single/multiple/free-text form, shell output, signed file reads, cursor recovery,
rejected write without a created file, cancellation and continuation. Only model
HTTP replies were scripted in this source workflow; a separate actual-provider
Buda ACP browser story passed independently. This does not claim production
daemon replacement or live acceptance for every vendor runner.

[Source-backed browser recording](https://pub-5d59c786708441b3a80620d87e7dee2b.r2.dev/tmp/2026-10-27/buda-acp-fidelity/source-story.webm)
