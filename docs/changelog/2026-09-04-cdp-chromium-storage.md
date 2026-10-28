# Limit CDP Chromium Storage Growth

## Changes

- Moved the CDP Chromium user profile from the default persistent configuration
  directory to `/tmp/bunny-agent-chromium`.
- Moved the Chromium disk cache to `/tmp/bunny-agent-chromium-cache`.
- Capped the Chromium disk and media caches at 100 MiB each.
- Applied the storage settings to the published, local, and template Docker
  images and to the daemon entrypoint example.
- Added a regression assertion to the runner CLI image build test.

## Verification

- Passed the runner CLI test suite (35 tests).
- Passed Biome checks for the modified TypeScript test.
- Passed the daemon example entrypoint shell syntax check.
- Passed Dockerfile consistency and Git whitespace checks.
