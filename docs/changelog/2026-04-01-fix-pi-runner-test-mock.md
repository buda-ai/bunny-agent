# Fix pi-runner test mock for ModelRegistry.inMemory

## Changes

- Updated `vi.mock("@mariozechner/pi-coding-agent")` in `packages/runner-pi/src/__tests__/pi-runner.test.ts`
  to expose `ModelRegistry.inMemory` and `AuthStorage.create` as static methods returning
  properly shaped mock objects (with `authStorage.setRuntimeApiKey` / `removeRuntimeApiKey`).
- This aligns the mock with the real `@mariozechner/pi-coding-agent@0.64.0` API where
  `ModelRegistry` is a class with `static inMemory(authStorage)` and `static create(authStorage, path)`.

## Root Cause

The production code (`pi-runner.ts`) calls `ModelRegistry.inMemory(AuthStorage.create())`,
but the test mock only defined `ModelRegistry` as a plain constructor without static methods,
causing `TypeError: ModelRegistry.inMemory is not a function` in all 9 `createPiRunner` tests.
