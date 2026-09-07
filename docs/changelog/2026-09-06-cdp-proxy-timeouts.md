# Extend CDP Proxy Timeouts

## Changes

- Increased the nginx CDP proxy read and send timeouts to one hour.
- Enabled TCP keepalive for the nginx connection to Chromium.
- Applied the settings to the published, local, and template Docker images and
  to the daemon entrypoint example.
- Added regression assertions to the runner CLI image build test.

## Verification

- Passed the runner CLI test suite (35 tests).
- Passed Biome checks for the modified TypeScript test.
- Passed the daemon example entrypoint shell syntax check.
- Passed CDP proxy configuration consistency and Git whitespace checks.
