# Changelog: Pi runner — merge `options.env` into `process.env`

## `packages/runner-pi/src/pi-runner.ts`

- Added `pushRunnerEnvToProcess()` and call it at the start of `run()`, with restore in an outer `finally`.
- Ensures `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / etc. from sandagent-daemon `POST /api/coding/run` body are visible to pi-coding-agent `AuthStorage`, which reads credentials from `process.env` by name.
