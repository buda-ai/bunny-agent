---
title: 2026-08-06 Fix Hosted Pi Tool Approval Default
---

# Fix Hosted Pi Tool Approval Default

Date: 2026-08-06
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> Review the current BunnyAgent changes and fix Buda chats that stall on tool calls.

**Refined Instructions:**
- Reproduce the supplied Buda chat failure before editing.
- Review the current BunnyAgent branch and preserve unrelated runner behavior.
- Fix the hosted Pi integration without changing the runner CLI approval default.
- Add focused regression coverage for implicit and explicit approval settings.

## What Changed
- Defaulted hosted SDK Pi runs to bypass regular tool approvals when `yolo` is omitted.
- Preserved explicit `yolo: false` for hosts that implement the approval-file workflow.
- Documented the hosted Pi default and added daemon request-body regression tests.
- Applied the repository's Biome formatting to the hosted Pi `yolo` fallback expression.

## Why

The Pi runner alignment change interpreted an omitted `yolo` value as approval-required. Hosted SDK consumers such as Buda do not provide a generic approval UI for normal tools, so `read` and `write` calls remained pending until the outer chat command timed out.

## Files Affected
- `packages/sdk/src/provider/bunny-agent-language-model.ts` - Applies the Pi-only hosted default.
- `packages/sdk/src/provider/types.ts` - Documents approval behavior for SDK callers.
- `packages/sdk/src/__tests__/tool-refs.test.ts` - Covers default bypass and explicit approval mode.

## Breaking Changes

None.

## Testing
- Run the focused SDK provider tests.
- Run the SDK typecheck and build.
- Retry a Buda Pi chat that invokes a `write` tool and verify it completes without an approval file remaining pending.
