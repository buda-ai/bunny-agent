# Revert Runner Alignment Sync

## Summary

Reverted the runner alignment synchronization introduced by commit `0a9b2931793cad3ac3402d83d10f49a445526d9c` while preserving the structured agent input and file context behavior added in the subsequent commit.

## Changes

- Removed the runner alignment changes introduced by the reverted commit.
- Resolved runner harness conflicts against the pre-sync dispatch behavior.
- Preserved `AgentTurnInputV1` parsing, compilation, and structured delivery to Claude and Pi.
- Preserved rejection of structured image input for runners that only accept text.
- Retained focused runner harness coverage for structured input forwarding.

## Verification

- Passed the workspace TypeScript typecheck.
- Passed focused manager, runner harness, Claude, Pi, and SDK structured input tests.
