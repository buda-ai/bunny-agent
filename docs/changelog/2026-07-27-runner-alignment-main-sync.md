# Synchronize main into runner alignment round 2

Date: 2026-07-27

## Why

The `runner-alignment-round2` branch needs the latest changes from `main` so
its open pull request can be reviewed and merged without branch conflicts.

## What Changed

- Created a dedicated synchronization branch from `runner-alignment-round2`.
- Refreshed the `origin/main` and `origin/runner-alignment-round2` references.
- Started the merge from `origin/main` and identified conflicts in runner
  documentation, package metadata, the shared harness, Copilot, Gemini,
  OpenCode, Pi, and the workspace lockfile.
- Chose the upgraded SDK implementations from `main` as the resolution base,
  while preserving round-two-only runner capabilities during reconciliation.
- Preserved Claude skill-path and tool-ref dispatch, Pi's file-based approval
  gate, and ACP session loading with replay suppression.
- Combined Copilot's upgraded permissions, tool filtering, reasoning effort,
  and lifecycle handling with compaction events and an unexpected-end guard.
- Updated the runner maturity matrix to describe the reconciled behavior and
  current SDK versions.

## Verification

- `pnpm install --frozen-lockfile`
- `@bunny-agent/runner-acp`: typecheck and 3 tests passed.
- `@bunny-agent/runner-copilot`: typecheck and 5 tests passed.
- Remaining package and repository verification is in progress.
