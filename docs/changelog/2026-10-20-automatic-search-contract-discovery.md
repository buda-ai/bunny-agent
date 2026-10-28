# Automatic search contract discovery

Date: 2026-10-20

## Decision

- Add SDK provider/per-model `searchContractVersion: "auto"` alongside the
  existing strict `1` option. Keep an omitted setting on the legacy path.
- Discover Pi support through a read-only sandbox-side `/healthz` GET before
  coding execution. Advertise daemon capabilities using the same runner resolver
  that produces actual stream acknowledgements, including honest query-only
  Codex capabilities.
- Select v1 only when structured retrieval and explicit source-marker
  annotations are advertised. Healthy older daemons use legacy behavior; failed
  or malformed discovery rejects without execution, downgrade, or retries.
- Scope healthy-result caching to the actual handle, sandbox ID, and endpoint
  for 30 seconds, with at most 16 entries per handle and single-flight probes.
  Preserve independent caller cancellation and bounded transport waits.
- Execute on the exact discovered handle. Keep negotiation and acknowledgement
  state local to one invocation, including overlapping calls on one model.
- Document the public option in the SDK README and explain the automatic health
  probe exception alongside the existing daemon transport documentation.

## Why

Product consumers can use compatible structured search and answer citations
without maintaining a runtime-version rollout flag or triggering an agent turn
to test support. Discovery is a read-only transport operation, not a replayable
coding run. An in-place runtime restart can remain cached for up to the documented
TTL; network/authentication/server errors never count as evidence of old support.

## Supersedes

Product-side manual selection of v1 solely to handle mixed old/new daemon images.
Explicit v1 acknowledgement requirements and the legacy protocol remain intact.

## Acceptance

Focused SDK tests cover new/old runtimes, one coding execution, strict missing
acknowledgements, malformed/error responses, concurrent calls, cache isolation and
expiry, cancellation, and non-cooperating transport timeouts. Daemon health tests
verify the advertised runner capabilities. Live consumer integration remains a
separate validation step. Local validation passed 70 focused SDK tests, SDK
typechecking, seven runner capability tests, the daemon health HTTP test, and
Biome checks for the nine changed TypeScript files.

## Fresh provider and consumer verification

- The complete SDK suite passed: 14 files, 132 tests. SDK typecheck, scoped
  Biome and the SDK/daemon dependency build passed.
- A real model call against the pre-discovery daemon completed in legacy mode
  after exactly one health GET and one coding POST without a version flag.
- A real local Buda Gemini/Tavily run produced five retrieval results and two
  persisted answer citations with verified source/tool bindings, exact Unicode
  ranges, click details, no source footer and browser reload.
- OpenSpec task 7.2 is now checked. The verification report links sanitized
  live evidence and keeps published-package, Sandock and cloud acceptance open.

## Evidence presentation

- Remove embedded product screenshots from the verification report and PR
  description. Keep textual validation and the sanitized evidence summary.
