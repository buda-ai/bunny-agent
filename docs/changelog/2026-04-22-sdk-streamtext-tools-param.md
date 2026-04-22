# SDK streamText tools parameter support

## Session log

- Reviewed `@bunny-agent/sdk` provider flow and confirmed `LanguageModelV3CallOptions.tools` was not being propagated to runner execution.
- Added per-request tool resolution in `packages/sdk/src/provider/bunny-agent-language-model.ts`:
  - `streamText` call options now resolve tool names from `options.tools`.
  - Resolved tool names are forwarded to daemon body (`allowedTools`) and CLI runner invocation (`runner.allowedTools`) for that request.
  - Existing provider-level defaults remain the fallback when `streamText` tools are omitted.
- Added test coverage in `packages/sdk/src/__tests__/bunny-agent-language-model.test.ts` for:
  - provider-default fallback,
  - streamText override behavior,
  - dedupe/trim handling,
  - explicit empty-tool behavior.
- Updated `packages/sdk/README.md` API reference to document `streamText({ tools })` passthrough behavior.

## Validation log

- Baseline (before code changes):
  - `corepack pnpm lint` passed with one pre-existing warning in `apps/web/app/(example)/example/page.tsx` (`noImgElement`).
  - `corepack pnpm build` failed in `@bunny-agent/web` because `next/font` could not fetch Google Fonts (`Inter`) in this environment.
  - `corepack pnpm test` passed.
- After SDK changes:
  - `corepack pnpm --filter @bunny-agent/sdk lint` passed (applied formatting to changed SDK files).
  - `corepack pnpm --filter @bunny-agent/sdk build` passed.
  - `corepack pnpm --filter @bunny-agent/sdk test` passed.
  - `corepack pnpm --filter @bunny-agent/sdk typecheck` passed.
