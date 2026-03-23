# Session changelog — 2026-03-23 (SDK skillPaths merge)

## Problem

`--skill-path` was missing from the runner CLI command when `skillPaths` were set only on **`createSandAgent({ skillPaths })`** default options. `createModel` only copied `options.skillPaths` from the per-call `sandagent(model, { ... })` argument, so defaults were ignored.

## Fix

- **`packages/sdk/src/provider/sandagent-provider.ts`:** Merge `skillPaths` with `options.skillPaths !== undefined ? options.skillPaths : defaultOptions.skillPaths`, then attach to `RunnerSpec` when non-empty.
- Verbose debug log appends `skillPaths=N` when paths are present.
- **`apps/web/app/api/ai/route.ts`:** Move example `skillPaths` onto `sandagentOptions` and call `sandagent(model)` so the default merge is used.
