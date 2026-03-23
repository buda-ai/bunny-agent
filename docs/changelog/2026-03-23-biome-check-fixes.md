# Session changelog — 2026-03-23 (biome check)

## Changes

- Ran `pnpm biome check --write --unsafe .` to apply safe/unsafe fixes (unused imports/vars, `indexOf` vs `findIndex`, etc.).
- **Manual:** `example/page.tsx` — removed unused `messages` prop from `ChatMessage`.
- **Manual:** `packages/benchmark-cli/src/runners/base.ts` — replaced invalid biome suppression placeholder with a real explanation.
- **Manual:** `packages/kui/.../sidebar.tsx` — `biome-ignore` for `document.cookie` (shadcn persistence pattern).
