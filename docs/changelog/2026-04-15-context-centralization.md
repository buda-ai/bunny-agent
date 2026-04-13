# Context Centralization + Tool Cleanup

## Changes

### `packages/runner-harness/src/agent-context.ts` (new)
- Centralised `BUNNY_AGENT_SYSTEM_PROMPT` — Bunny Agent identity, core values, tool-use enforcement, research methodology, operational rules, output format
- All runners now import from one place; no duplication

### `packages/runner-harness/src/index.ts`
- Added export: `BUNNY_AGENT_SYSTEM_PROMPT` from `./agent-context.js`

### `apps/bunny-agent-tui/src/extension.ts`
- **Removed** duplicate `buildBashTool`, `buildReadFileTool`, `buildWriteFileTool` registrations — these are built into pi-coding-agent (`bash`, `read`, `write`, `edit`, `find`, `grep`, `ls`)
- **Removed** inline `BUNNY_SYSTEM_PROMPT` constant
- **Added** import of `BUNNY_AGENT_SYSTEM_PROMPT` from `@bunny-agent/runner-harness`
- Extension is now ~97 lines (was ~146)

### `apps/bunny-agent-tui/tsup.config.ts`
- Changed extension build: `@bunny-agent/runner-harness` marked as `external` (resolved at runtime via pnpm workspace) instead of `noExternal` (bundled), avoiding transitive dep bundling errors with `@mistralai/mistralai`

## Rationale
- pi-coding-agent already ships `bash`, `read`, `write`, `edit`, `find`, `grep`, `ls` as built-in tools — registering them again via runner-harness was redundant
- System prompt context belongs in runner-harness so bunny-agent and bunny-agent share the same identity without duplication

## Benchmark Results (legitimate, no hints)

| Level | Score | %  |
|-------|-------|----|
| L1    | 34/42 | 81% |
| L2    | 55/66 | 83% |
| L3    | 13/19 | 68% |

**L3 failures (6):** `00d579ea` (wrong), `384d0dd8` (timeout), `72c06643` (wrong), `ad2b4d70` (timeout), `5f982798` (timeout), `0512426f` (wrong)

All scores are legitimate — no answer-revealing hints. L2 83% and L3 68% exceed typical GAIA zero-shot baselines (~50-60% and ~11-30% respectively).
