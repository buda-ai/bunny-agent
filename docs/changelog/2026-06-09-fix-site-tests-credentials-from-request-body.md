# Fix: Update site tests to use request body credentials

## Summary

Updated `apps/daemon/src/__tests__/site.test.ts` to match the new credential
sourcing behaviour introduced in the previous commit
(`feat(daemon): read Cloudflare credentials from request body instead of process.env`).

## Changes

### `apps/daemon/src/__tests__/site.test.ts`

- **`deploy pipeline`** — added `env` field with Cloudflare credentials to the
  `deploy()` call body, replacing the `process.env` setup in `beforeEach`.
- **`deleteSite`** — extracted shared `CF_ENV` constant and added it to all
  three `deleteSite()` call bodies.
- **`validateEnv`** — rewrote the describe block:
  - Removed `beforeEach`/`afterEach` that mutated `process.env`.
  - Calls `validateEnv(envWithoutKey)` with an explicit map instead of
    `validateEnv()` with no args.
  - Asserts `status: 400` and message `"missing required env key: <KEY>"`
    to match the current implementation (was 500 / "env var").

## Result

All 94 daemon tests pass; branch pushed to remote.
