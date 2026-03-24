# sandbox-sandock: Add optional `command` parameter for sandbox creation

**Date:** 2026-03-24

## Summary

Added an optional `command` parameter to `SandockSandboxOptions` in the `sandbox-sandock` package.
When provided, the command is passed to the Sandock API during sandbox creation.
When omitted, the existing creation logic is preserved unchanged.

## Changes

- **`packages/sandbox-sandock/src/sandock-sandbox.ts`**
  - Added `command?: string[]` to `SandockSandboxOptions` interface
  - Added `command` field to `SandockSandbox` class
  - Stored `command` from options in constructor
  - Passed `command` through to Sandock API in `createAndStartSandbox`

- **`packages/sandbox-sandock/src/__tests__/sandock-sandbox.test.ts`**
  - Added test verifying `command` is passed to the Sandock API when provided
  - Added test verifying `command` is `undefined` when not provided
  - Updated existing "should accept custom options" test to include `command`
