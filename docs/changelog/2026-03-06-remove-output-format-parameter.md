# 2026-03-06 Remove output-format parameter

## Session Log

### 01:02
- Started removing `--output-format` from `sandagent run` CLI surface.
- Located all references in `apps/runner-cli`, benchmark runners, tests, and docs.

### 01:06
- Updated `apps/runner-cli/src/cli.ts`:
  - Removed `OutputFormat` type import.
  - Removed `outputFormat` from parsed run args.
  - Removed `--output-format` (`-o`) option parsing.
  - Removed deprecation warning path for `--output-format`.
  - Removed `outputFormat` forwarding into `runAgent()`.
  - Removed `--output-format` from `run --help` output.

### 01:08
- Updated `apps/runner-cli/README.md`:
  - Removed `--output-format` option documentation.
  - Replaced stream/json split with a single output-format section that documents default SSE data stream behavior.
  - Removed JSON-only CLI examples using `-o json`.

### 01:09
- Updated `apps/runner-cli/docs/OUTFORMAT_FEATURE.md`:
  - Converted feature summary into a current-state note.
  - Documented that `runner-cli` no longer accepts `--output-format` and always emits data stream output.

### 01:10
- Updated benchmark integrations that invoke `sandagent run`:
  - `packages/benchmark-sandagent/src/runners/sandagent.ts`: removed `--output-format stream` from command args.
  - `packages/benchmark-sandagent/test/base-runner.test.ts`: removed `--output-format stream-json` from test runner defaults.
  - `packages/benchmark-cli/src/runners/sandagent.ts`: removed `--output-format stream-json` from command args.
  - `packages/benchmark-cli/src/runners/pi.ts`: removed `--output-format stream-json` from command args.

### 01:11
- Updated web docs page `apps/web/content/docs/advanced/output-format.mdx`:
  - Removed JSON-output mode documentation.
  - Updated usage to `sandagent run [options] -- "<user input>"`.
  - Clarified that data stream (SSE) is the only supported output format.

### 01:13
- Added integration coverage in `apps/runner-cli/src/__tests__/runner-cli.integration.test.ts`:
  - New test asserts `sandagent run --output-format ...` is rejected with unknown-option error.

### 01:14
- Verification executed:
  - ✅ `pnpm --filter @sandagent/runner-cli build`
  - ✅ `pnpm --filter @sandagent/benchmark-sandagent build`
  - ✅ `pnpm --filter @sandagent/benchmark-cli build`
  - ✅ `pnpm --filter @sandagent/runner-cli exec vitest run src/__tests__/runner-cli.integration.test.ts --testNamePattern "should reject removed --output-format option"`
  - ⚠️ `pnpm --filter @sandagent/runner-cli test -- src/__tests__/runner-cli.integration.test.ts` still hits existing timeout in `should accept claude runner option`.
  - ⚠️ `pnpm --filter @sandagent/benchmark-sandagent test -- test/base-runner.test.ts` fails existing assertions that expect legacy `0:` chunk format instead of SSE validation behavior.

### 01:24
- Ran full workspace validation and resolved lint blockers:
  - `pnpm typecheck` passed.
  - `pnpm lint` initially failed on formatting/import ordering in 8 files.
  - Applied fixes via `pnpm biome check --write` to those files.
  - Re-ran `pnpm typecheck && pnpm lint && pnpm build`; all passed.

### 01:40
- Started cross-runner capability hardening for coding runners (`claude`, `codex`, `gemini`, `opencode`, `pi`).
- Implemented `runner-pi` upgrades:
  - Added strict model format validation (`<provider>:<model>`).
  - Added env-aware base URL override resolution.
  - Reworked streaming loop to event-driven wakeup (removed polling sleep loop).
  - Switched text emission to `assistantMessageEvent.text_delta` to avoid duplicated text fragments.
  - Added abort signal handling via `agent.abort()` and deterministic error/finish stream output.
- Implemented ACP subprocess runner upgrades:
  - `runner-gemini`: added `env` and `abortController` options with graceful abort and early-exit error handling.
  - `runner-opencode`: added `env` and `abortController` options with graceful abort and early-exit error handling.
- Updated `apps/runner-cli/src/runner.ts` to pass `env` + `abortController` through all runner constructors and pass model/env/abort to `opencode` + `gemini`.

### 02:13
- Added `@sandagent/runner-pi` package-level test coverage:
  - `packages/runner-pi/src/__tests__/pi-runner.test.ts` with stream, model-validation, and abort-behavior cases.
  - Added `packages/runner-pi/vitest.config.ts`.
  - Updated `packages/runner-pi/package.json` scripts/devDependencies (`typecheck`, `test`, `vitest`).
- Added `packages/runner-pi/README.md` with usage/options and output behavior.
- Updated runner docs for ACP CLIs:
  - `packages/runner-gemini/README.md`: replaced invalid `yolo` option with `env` and `abortController`.
  - `packages/runner-opencode/README.md`: replaced invalid `sessionKey` option with `env` and `abortController`.
- Updated runner CLI docs/help to list `opencode` in runner options.

### 02:15
- Validation completed after cross-runner hardening:
  - ✅ `pnpm typecheck`
  - ✅ `pnpm lint`
  - ✅ `pnpm build`
  - ✅ `pnpm --filter @sandagent/runner-pi test`

### 02:20
- Investigated latest failed CI run (`run_id: 22728607691`, workflow: `CI`).
- Root cause: `ERR_PNPM_OUTDATED_LOCKFILE` during `pnpm install` in CI (`frozen-lockfile` default).
- Confirmed fix locally by updating lockfile and running:
  - `pnpm install --frozen-lockfile` ✅
- This session also includes runner capability updates that required lockfile refresh.

### 09:06
- Investigated additional GitHub Actions failure on `main` (`Publish @sandagent/runner-cli to NPM`, run `22743936170`).
- Found two concrete causes in publish pipeline:
  - `runner-cli` tests executed before building internal runner package artifacts (`runner-codex`, `runner-gemini`, `runner-opencode`, `runner-pi`) and before generating `apps/runner-cli/dist/bundle.mjs`.
  - Integration test `should accept claude runner option` was environment-sensitive and could hang.
- Fixes applied:
  - Updated `.github/workflows/publish-runner-cli.yml` build-dependencies step to build all runner package dependencies and `runner-cli` before tests.
  - Updated `apps/runner-cli/src/__tests__/runner-cli.integration.test.ts` to force deterministic unauthenticated Claude path and assert successful stream output.
- Verification:
  - ✅ `pnpm --filter @sandagent/runner-cli test` (19/19 passed)

### 09:10
- Bumped `@sandagent/runner-cli` package version:
  - `apps/runner-cli/package.json`: `0.2.18` -> `0.5.0`
