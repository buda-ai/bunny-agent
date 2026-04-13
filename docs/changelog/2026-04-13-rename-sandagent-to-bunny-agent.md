# Rename: SandAgent → Bunny Agent

**Date:** 2026-04-13

## Summary

Complete project-wide rename from "SandAgent" to "Bunny Agent" across the entire codebase.

## Changes

### Package Scope
- `@sandagent/*` → `@bunny-agent/*` in all `package.json` files and TypeScript imports.

### Class / Type / Function Names (TypeScript)
- `SandAgent` → `BunnyAgent` (class name in `packages/manager/src/bunny-agent.ts` and all references)
- `isSandagentDaemonHealthy` → `isBunnyAgentDaemonHealthy` in SDK

### Environment Variables
- `SANDAGENT_*` → `BUNNY_AGENT_*` (e.g. `BUNNY_AGENT_WORKSPACE`)

### CLI Bin Name
- `sandagent` → `bunny-agent` in `apps/runner-cli` and `apps/manager-cli`

### Docker Image Names
- `vikadata/sandagent` → `vikadata/bunny-agent`
- `ghcr.io/vikadata/sandagent` → `ghcr.io/vikadata/bunny-agent`

### File Renames (git mv)
| Old | New |
|-----|-----|
| `docker/sandagent-claude/` | `docker/bunny-agent-claude/` |
| `packages/manager/src/sand-agent.ts` | `packages/manager/src/bunny-agent.ts` |
| `packages/manager/src/__tests__/sand-agent.test.ts` | `packages/manager/src/__tests__/bunny-agent.test.ts` |
| `packages/sdk/src/provider/sandagent-provider.ts` | `packages/sdk/src/provider/bunny-agent-provider.ts` |
| `packages/sdk/src/provider/sandagent-language-model.ts` | `packages/sdk/src/provider/bunny-agent-language-model.ts` |
| `packages/sdk/src/react/useSandAgentChat.ts` | `packages/sdk/src/react/useBunnyAgentChat.ts` |
| `packages/runner-pi/src/sandagent-resource-loader.ts` | `packages/runner-pi/src/bunny-agent-resource-loader.ts` |

### Documentation
- All `.md` files updated to use "Bunny Agent" in prose.
- `pnpm-workspace.yaml` updated to reference `docker/bunny-agent-claude`.
- `pnpm-lock.yaml` regenerated after package name changes.

## Preserved (Not Renamed)
- `sandock` — third-party service, unchanged.
- `sandagent-daemon-0.1.0.tgz` — legacy tgz artifact at repo root, not renamed.
- `https://github.com/vikadata/sandagent` — GitHub repo URL, cannot be renamed unilaterally.
- `node_modules/`, `.git/`, `dist/`, `benchmark-results/` — skipped.
