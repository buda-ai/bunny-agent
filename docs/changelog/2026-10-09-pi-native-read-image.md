# Pi Native ReadImage

## Changes

- Added Pi package and website documentation for `read_image` and its model and
  permission boundaries.
- Implemented and registered `read_image` with native Pi image processing,
  declared model capability checks, existing approval/allowlist handling,
  cancellation, and text redaction.
- Added an explicit capability check before uploaded images reach Pi prompts.
- Added native decoder/resizer tests, permission and capability regressions, and
  local HTTP end-to-end tests for file reads, ordered uploads, and resumed image
  history using built CLI, daemon, SDK, and local sandbox code.
- Added opt-in live file/upload vision tests using random digits and colored
  shapes, and documented build prerequisites and test configuration.
- Made the E2E harness wait for actual sandbox HTTP command completion before
  daemon shutdown, with bounded waits and transport-error assertions.

## Verification

- Pi runtime type checking and relevant CLI, daemon, SDK, and local sandbox
  builds passed. The existing Pi suite passed (196 tests) before adding new tests.
- Pi tests passed (214 tests), including real image decoding/resizing and the
  existing bash/MCP regression tests. SDK tests passed (41 tests).
- Local HTTP image end-to-end tests passed for both file-tool and upload flows,
  including session restoration and clean HTTP command completion. The CLI
  suite passed (38 tests, 2 opt-in live cases skipped); the final E2E harness
  rerun passed both local cases without transport errors.
- Pi, CLI, SDK, daemon, and local sandbox type checks passed. Scoped Biome,
  documentation navigation validation, and `git diff --check` passed.
- Live vision was attempted but the endpoint rejected requests with HTTP 403
  `unsupported_country_region_territory`. Real visual understanding remains
  unverified; the opt-in tests are retained for an accessible endpoint.
- Retried both live file and upload cases at the user's request. Both failed
  again with `unsupported_country_region_territory` before visual recognition;
  the file case explicitly reported HTTP 403. No live case passed.
- No actual OCR backend was exercised; existing bash/MCP extensibility passed,
  which does not establish OCR recognition accuracy.
- Local protocol tests prove transport only; live vision and actual OCR proof
  require their respective test environments.
- Verification level: partial. No browser screenshots were produced; evidence
  consists of runtime CLI/HTTP tests and the recorded check results above.

## Pull Request Preparation

- Added a release changeset for the runner CLI's native Pi image tool.
- The user requested a pull request and explicitly skipped lint and typecheck
  for this publishing step; earlier check results above remain historical.
- The pull request targets `main` and contains only the ReadImage feature and
  its supporting tests, documentation, and release changeset.
- Removed OpenSpec planning artifacts from the pull request and updated its
  description to professional English.
