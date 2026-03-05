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
