# Fix CDP Dockerfile Continuations

## Changes

- Fixed malformed line continuations in the Chromium startup command across
  the published, local, and template Dockerfiles.
- Added regression coverage that validates the escaped line ending of every
  Chromium storage argument in all three Dockerfiles.

## Verification

- Passed the runner CLI test suite (36 tests).
- Passed Biome checks for the modified TypeScript test.
- Passed Docker BuildKit validation for the published Dockerfile.
- Passed Git whitespace checks.
