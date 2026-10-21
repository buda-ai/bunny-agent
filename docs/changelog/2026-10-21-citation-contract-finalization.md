# Finalize the search citation contract

## Changes

- Merge the current Pi resource-loader and tool-hook implementation while
  preserving citation source registration and the combined caller/citation
  system prompt. The official secret and approval hooks remain in place.
- Assign Harness search References from the distinct canonical sources in
  `action.sources`, so duplicate or URL-normalized result rows share the
  correct Reference instead of shifting later citations to another URL.
- Centralize the existing citation instructions in the manager's
  `citation-guidance` module. Pi search tools, Harness search tools and Pi
  session guidance consume the same policy without changing citation behavior.
- Update the release note to describe the current OpenAI citation-formatting
  markers rather than the removed custom marker syntax.

## Verification

- Add a Harness-to-Pi regression for Brave and Tavily: an empty search followed
  by duplicate canonical URLs and a distinct source. Render the actual tool
  markers through the registry and citation processor and check target URLs,
  provenance and diagnostics.
- Add a real Pi session test against a scripted OpenAI-compatible endpoint to
  check the combined system prompt and secret hook with citations enabled.
- Check that both search tools and session guidance use the shared policy.
- All Pi tests pass (368 tests across 28 files), all Harness tests pass
  (38 tests across 4 files), and all manager tests pass (221 tests across
  19 files). All SDK tests pass (135 tests across 16 files): 762 tests
  across the four suites. Pi, Harness, manager, SDK and daemon typechecks
  and the scoped Biome check pass.
- A frozen-lockfile install refreshes Pi's merged dependency patch before
  running the resource-loader and session-location regressions.

- Build the daemon, SDK and their workspace dependencies successfully.
- Independently rerun 67 focused Pi regressions, including the real-session
  hook integration and Harness-to-Pi source projection.
- Run SDK auto negotiation through the rebuilt local daemon and Pi with
  OpenAI GPT-4.1 mini and real Tavily search: five results, four valid
  annotations, exact Unicode ranges after an emoji, no raw markers, and
  unchanged UIMessage JSON round-trip.
- Run a fresh downstream Buda browser request with GPT-6 Luna through the
  rebuilt daemon and real Tavily: five results and two valid citations.
  Title pills, source-detail targets, copying without generated markers,
  no trailing source summary, and full reload pass with zero page errors.
  The copy check waits for the source popover to close before clicking.
- This is local source/build validation. Successful live Brave, published
  package installation, container deployment and production acceptance
  remain separate release checks.

## Scope

The long provider tool-call ID limit and CLI version parsing are unchanged.
