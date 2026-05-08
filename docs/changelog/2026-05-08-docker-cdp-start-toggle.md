# Docker CDP Startup Toggle

## Changes

- Added `START_CDP_ON_INIT`, defaulting to `1`, to the Bunny Agent Claude Docker image.
- Updated Docker entrypoints so `start-cdp` is skipped when `START_CDP_ON_INIT` is set to `0`.
- Kept CDP startup enabled by default for existing image users.
