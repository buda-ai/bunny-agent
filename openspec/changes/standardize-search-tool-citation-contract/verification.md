# Verification and remaining acceptance

Date: 2026-10-16
Baseline: main@38c228c, v0.9.62
Status: 30 of 31 tasks complete. Task 7.2 remains unchecked.

## Scoped checks

- 44 affected test files passed, 536 tests total. Coverage includes manager
  contracts and CLI construction, SDK stream/generate/UIMessage handling,
  request isolation and peer compatibility, Pi marker/native/session/stream
  handling, provider normalization, harness dispatch, and Codex adaptation.
- Strict scoped SDK and Pi TypeScript checks passed. Manager compilation and
  SDK backend/contracts/React builds with declarations passed.
- Published-condition Node contract imports, TypeScript consumer imports,
  and the browser contract bundle passed. The browser bundle contains no
  Node hashing or orchestration imports.
- The compiled SDK root accepted a supported peer metadata fixture and
  retained acknowledgement/text metadata through a sandbox-adapter fixture.
  It rejected an older peer metadata fixture before sandbox attachment.
  These fixtures exercise package resolution and ES2022 output, not AI SDK
  execution. Separate unit regressions bundle the guard and run it in a
  fresh Node process for both peer versions.
- Seven documentation/design JSON examples and the illustrative handoff
  fixture passed contract validation. The handoff projection exactly matches
  `projectUIMessageOutputText()` from the built public SDK contracts entry;
  URL identities and the Unicode `[4,7)` example are verified.
- Scoped Biome checks and `git diff --check` passed.

Checks used workspace source aliases and isolated dependencies matching the
manifest's Pi 1.2.0 versions. Fresh Node child processes received matching
external dependency resolution. Installed library source was not patched;
verification configuration and logs are not release files.

## Actual model integration

All 10 scenarios passed through an actual `gpt-5.6-sol` model and native Pi,
using controlled Tavily HTTP responses. The matrix was rerun after the
final provider/parser and compiled-peer-guard repairs.

| Transport | Success | Empty | HTTP 429 | HTTP 401 | Legacy |
| --- | --- | --- | --- | --- | --- |
| Local daemon coding-run | Pass | Pass | Pass | Pass | Pass |
| Runner CLI fallback | Pass | Pass | Pass | Pass | Pass |

The chain includes SDK `streamText().toUIMessageStream({sendSources:true})`
and `readUIMessageStream()` on actual `ai@6.0.264`. Each successful transport
produced three model-authored citations. Every source binding matched its
executed search results, each code-point range covered its exact emitted
marker, and source events were unique. Empty and failed searches created no
citations. Failure envelopes survived in final tool-part
`resultProviderMetadata["bunny-agent"].search_result`; no error `output`
field is assumed. Legacy requests retained their original search format.

## Independent review repairs

Independent review reproduced and repaired nested Markdown code-fence
rewrites, harness authentication failures masked by fallback, and malformed
provider payloads misrepresented as confirmed empty results. Provider
conformance tests now distinguish explicit empty arrays from missing lists
and discarded rows, preserve legacy behavior, and compare equivalent Pi
and harness canonical results. V1 model-visible results contain validated
sources only. Container-prefix processing is bounded and retains later
text literally with partial diagnostics on overflow.

Publication review found that ES2022 bundling removed JSON import options
from the initial peer-version check. The backend now resolves peer JSON
lazily with Node `createRequire`; compiled-package tests cover both supported
and unsupported peers. V1 requires stable `ai >=6.0.264 <7.0.0`; legacy
retains `^6.0.0`. Packaged React hooks use `@ai-sdk/react ^3.0.267`.

## Package build follow-up

CI on `f9d5825` revealed that the earlier source-alias checks did not exercise
runner-pi's original ES2020 libraries and `rootDir: src`. A conformance test
inside `src` imported sibling runner-harness source (TS6059), its direct fetch
mock assignment conflicted with installed Response declarations (TS2322), and
`Object.hasOwn` required a newer library target (TS2550).

The repair moves the cross-package test into runner-pi's `tests` directory,
uses Vitest global stubbing/restoration, and uses an ES2020-compatible own-property
helper. Test coverage and the package's compiler configuration remain intact.

A fresh filtered workspace installation from the committed lockfile reproduced
all three reported compiler failures before the repair. Without source aliases
or compiler-option overrides, the repaired actual manager/apply-patch/Pi build
subgraph and Pi typecheck passed. Four directly affected test files passed 96
tests; the complete Pi suite passed 23 files / 325 tests, including the relocated
22-case conformance file, using bounded forks with default file isolation.
Scoped Biome and diff checks passed. Dependency installation used `--ignore-scripts`;
the actual package build and test scripts were executed separately.

A diagnostic `singleFork` run failed six HTTP cases due to shared global fetch
stubs; the successful full-package run preserves file isolation. Earlier
536-test and actual-model matrix evidence is tied to `f9d5825` and is not
presented as a successful GitHub build. No new model/provider run is claimed
by this follow-up; GitHub workflow results are reported separately.

## SDK source consumer follow-up

GitHub's build on `bca7e52` passed runner-pi and then failed in the Next.js web
application because the SDK's source exports referenced `../contracts.js`.
Turbopack does not resolve these new internal `.js` paths to the corresponding
TypeScript source. The SDK now follows its existing extensionless internal
import style, including the contracts entry's projection re-export.

Actual SDK package checks also exposed a test that directly iterated a
ReadableStream without the corresponding async-iterable library declaration,
and a browser-bundle assertion tied to the current working directory. The
repair uses the standard reader API and retains the browser-platform build plus
fresh-process projection/JSON replay assertions without checking input filenames.

Using the fresh filtered lockfile installation and actual package configuration,
the Next.js production build, SDK ESM/declaration build (cleanup disabled), SDK
typecheck, and all 12 SDK test files / 96 tests passed. Scoped Biome passed for
three changed TypeScript files. These local checks used Node v24.20.0; GitHub's
Node 22 workflow is reported separately. No source aliases or compiler-option
overrides were used for these checks, and no new model/provider run is claimed.

## Remaining gates

Task 7.2 requires a **new runtime-supplied Tavily credential** for a fresh
real provider/model/daemon/SDK citation run. Earlier real Tavily source-card
evidence does not satisfy this task, and its discarded credential is not
reused. Controlled-provider success is not live Tavily acceptance.

Native ingestion has typed recorded-fixture coverage. Current Pi/Codex
adapters still report `native_annotations: false`; a supported upstream
hook and separate live verification are required before changing that
capability. This is the intended scope of tasks 5.1/5.2.

Downstream Buda inline citation rendering, structured-first card parsing,
database persistence, reload/fork UI behavior, and hosted OpenAI search
acceptance remain separate. The consumer checklist maps these to explicit
follow-up tests. kapps PR #8009 implements retrieved-source cards and does
not implement this answer annotation contract. This change remains opt-in.
