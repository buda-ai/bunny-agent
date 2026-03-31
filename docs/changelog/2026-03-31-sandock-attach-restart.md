# 2026-03-31 - Sandock attach restart for stopped and paused states

## Summary

Updated Sandock sandbox reuse behavior to restart existing instances when they are
in `STOPPED` or `PAUSED` state, instead of always creating a new sandbox.

## Changes

- `packages/sandbox-sandock/src/sandock-sandbox.ts`
  - Updated `tryAttachExisting()` state handling:
    - `RUNNING`: attach directly.
    - `STOPPED` / `PAUSED`: call `client.sandbox.start(id)` and then attach.
    - Other states (for example `CREATING`, `ERROR`, `DELETING`, `DELETED`):
      treat as non-reusable and fall back to creating a new sandbox.
  - Reattach after `STOPPED`/`PAUSED`: call `start`; if the API does not report
    `started: true`, clear id and create a new sandbox (no extra `get()` after start).

## Why

This aligns Sandock behavior with Daytona-style reuse semantics and avoids
unnecessary sandbox recreation when an existing sandbox can be resumed.

## Follow-up

- Unit test: when an existing sandbox is `STOPPED` but `start()` returns
  `started: false`, `attach()` falls back to `sandbox.create()` / `start()`.
