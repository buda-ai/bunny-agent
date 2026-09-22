# Docker npm Release Availability

- Diagnosed Docker release builds failing with `ETARGET` immediately after a
  successful tag release because npm had not yet exposed every package version
  required by the image.
- Added a bounded availability check for the exact
  `@bunny-agent/runner-cli` and `@bunny-agent/daemon` versions before starting
  the multi-platform Docker build.
- The check retries npm registry lookups for up to two minutes and reports the
  specific unavailable packages when propagation does not complete in time.
- Preserved the existing Docker Buildx summary and explicit job summary output.
- Verified the workflow YAML parses successfully, the embedded Bash logic
  resolves both packages for `0.9.61-release.4`, and `git diff --check` passes.
