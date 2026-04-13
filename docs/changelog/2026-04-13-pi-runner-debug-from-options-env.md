# Pi Runner: Read DEBUG flag from options.env

**Date:** 2026-04-13

## Change

`traceRawMessage` in `packages/runner-pi/src/pi-runner.ts` now reads the `DEBUG` flag from `options.env` (falling back to `process.env`), using the existing `getEnvValue` helper.

Previously, the function only checked `process.env.DEBUG`, which meant debug tracing was never activated when running through the daemon (where env vars are passed via `options.env`).
