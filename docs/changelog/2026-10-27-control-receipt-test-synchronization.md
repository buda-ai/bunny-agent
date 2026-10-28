# Synchronize asynchronous consumption receipt verification

Date: 2026-10-27
Author: Codex

## Request

Fix the failing PR check where the queued steering receipt test expected
`consumed` but still observed `accepted` on a loaded CI runner.

## Cause

The controller's consumption callback intentionally starts journal persistence
without awaiting it. Control status reads the latest durable receipt, so it can
still report `accepted` while the consumption receipt is being written. The test
incorrectly assumed real filesystem reads and atomic writes completed within a
fixed 10 ms sleep; yielding a timer does not guarantee filesystem completion.

## Changes

- Replace the fixed sleep with bounded polling of the observable control status.
- Gate the existing test's consumption write explicitly, verify status remains
  `accepted` while persistence is pending, release the gate, then require the
  durable receipt to become `consumed`.
- Preserve the real journal write, production queue ordering, and asynchronous
  receipt semantics. No production code or protocol changes are necessary.

## Validation

- All 94 server AI SDK tests passed across five files.
- Scoped server AI SDK typecheck passed.
- All 40 registry tests passed again after adding the explicit mock receiver type.
- All 134 daemon regression tests passed across eight files, including HTTP,
  Next.js, control, and production packaging coverage.
- Changed-file Biome and `git diff --check` passed.
