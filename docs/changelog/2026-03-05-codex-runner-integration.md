# 2026-03-05 Codex Runner Integration

## Session Log

### 21:58
- Started implementation for native `runner-codex` integration.
- Reviewed existing `runner-claude` and `runner-pi` architecture for compatibility.
- Confirmed local Codex reference SDK at `~/Documents/refs/codex/sdk/typescript` and selected `@openai/codex-sdk` for integration.

### 22:03
- Added new package `packages/runner-codex`.
- Implemented `createCodexRunner()` with `@openai/codex-sdk`:
  - Supports `model`, `resume`, `cwd`, `abortController`, and Codex thread options.
  - Converts Codex streamed events to AI SDK UI stream chunks (`0`, `9`, `a`, `d`, `3`).
- Added initial unit tests for streaming and resume path in `packages/runner-codex/src/__tests__/codex-runner.test.ts`.

### 22:06
- Wired Codex runner into `apps/runner-cli/src/runner.ts` (`case "codex"` now uses `createCodexRunner`).
- Updated `apps/runner-cli/package.json` dependencies:
  - Added `@openai/codex-sdk`.
  - Added workspace dependency `@sandagent/runner-codex`.
  - Added `@openai/codex-sdk` to esbuild externals.
- Added CLI unit coverage for Codex selection in `apps/runner-cli/src/__tests__/runner.test.ts`.
- Added concrete benchmark runner implementation for Codex in `packages/benchmark-sandagent/src/runners/codex.ts` and updated registry mapping.

### 22:09
- Updated documentation to reflect Codex support:
  - `README.md` status tables and architecture snippets now mark `runner-codex` as implemented.
  - `apps/runner-cli/README.md` now lists Codex as implemented and documents Codex auth env vars.
  - `packages/benchmark-sandagent/README.md` now includes `codex.ts` in runner architecture.
  - Updated CLI help text in `apps/runner-cli/src/cli.ts` for Codex env vars and runner list clarity.

### 22:11
- Installed workspace dependencies and regenerated lockfile (`pnpm-lock.yaml`) to include Codex SDK dependencies.
- Verification:
  - ✅ `pnpm --filter @sandagent/runner-codex test`
  - ✅ `pnpm --filter @sandagent/runner-codex build`
  - ✅ `pnpm --filter @sandagent/benchmark-sandagent build`
  - ✅ `pnpm --filter @sandagent/runner-cli build`
  - ⚠️ `pnpm --filter @sandagent/runner-cli test` still has an existing timeout in `runner-cli.integration.test.ts` (`should accept claude runner option`).

### 22:12
- Updated web docs landing page status in `apps/web/content/docs/index.mdx` to mark `@sandagent/runner-codex` as production-ready.

### 22:18
- Updated `run-benchmark.sh` to support `--runner codex`.
- Added Codex default model (`openai:gpt-5.2`) and execution branch that forwards `OPENAI_API_KEY` / `CODEX_API_KEY` and `OPENAI_BASE_URL`.
- Updated help text and examples in benchmark script for Codex usage.

### 22:22
- Executed benchmark command:
  - `./run-benchmark.sh --runner codex --model openai:gpt-5.2`
- Run completed, but all 5 smoking tasks failed due upstream model validation error from Codex/OpenAI endpoint:
  - `Invalid model name passed in model=openai:gpt-5.2`
- Benchmark result file generated at:
  - `benchmark-results/sandagent/smoking/sandagent-codex-openai-gpt-5.2-2026-03-05-22-02-38.json`

### 22:30
- Started debugging Codex benchmark failures caused by invalid model identifiers when using custom `OPENAI_BASE_URL`.
- Plan: detect available model IDs from configured endpoint and add model normalization for Codex runner input.

### 22:35
- Confirmed model IDs from configured `OPENAI_BASE_URL` include `gpt-5.2` (no provider prefix).
- Added Codex model normalization in `packages/runner-codex/src/codex-runner.ts`:
  - `openai:gpt-5.2` -> `gpt-5.2`
  - `openai:5.2` -> `gpt-5.2`
- Added unit test coverage for model normalization in `packages/runner-codex/src/__tests__/codex-runner.test.ts`.
- Updated `run-benchmark.sh` Codex default model/example to `gpt-5.2`.

### 22:42
- Found benchmark execution was using globally installed `sandagent` from PATH instead of the local repo build.
- Updated `packages/benchmark-sandagent/src/runners/codex.ts`:
  - Prefers local runner CLI at `apps/runner-cli/dist/bundle.mjs` when `PROJECT_ROOT` is set.
  - Falls back to global `sandagent` only when local path is unavailable.

### 22:50
- Performed clean rebuild of local `runner-cli` bundle to include latest Codex model normalization logic.
- Verified benchmark uses local CLI binary (`node apps/runner-cli/dist/bundle.mjs`) for Codex path.
- Confirmed working model for current `OPENAI_BASE_URL`: `gpt-5.2`.
- Benchmark success run:
  - `./run-benchmark.sh --runner codex --model gpt-5.2`
  - Result: `5/5` passed.
  - Output file: `benchmark-results/sandagent/smoking/sandagent-codex-gpt-5.2-2026-03-05-22-09-07.json`.

### 23:14
- Performed cleanup refactor for Codex benchmark runner code:
  - Added shared command finalization helper `finalizeCommand()` in `packages/benchmark-sandagent/src/runners/base.ts`.
  - Updated base `buildCommand()` to reuse `finalizeCommand()`.
  - Removed noisy extraction debug logs from base answer parser.
  - Simplified `packages/benchmark-sandagent/src/runners/codex.ts` by reusing base methods:
    - `buildCommand()` now delegates model/task assembly to base helper.
    - `extractAnswer()` now delegates to base extractor.
- Validation:
  - `pnpm --filter @sandagent/benchmark-sandagent build` passed.
  - `./run-benchmark.sh --runner codex --model gpt-5.2` passed with `5/5` on smoking dataset.

### 00:27
- Updated benchmark script default Codex model in `run-benchmark.sh`:
  - `DEFAULT_CODEX_MODEL` changed from `gpt-5.2` to `gpt-3.1-pro` per request.

### 00:32
- Updated `run-benchmark.sh` defaults to include:
  - `DEFAULT_GEMINI_MODEL="gemini-3.1-pro"`
- Kept `DEFAULT_CODEX_MODEL="gpt-5.2"`.
