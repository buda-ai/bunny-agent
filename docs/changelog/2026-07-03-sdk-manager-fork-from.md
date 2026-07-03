# SDK + manager + runner-cli: expose forkFrom end-to-end

Date: 2026-07-03

## Summary

Thread the pi-runner `forkFrom` option (added in the earlier runner-pi PR)
through every downstream layer:

- `@bunny-agent/manager` — add `forkFrom` to `StreamInput` and
  `BunnyAgentCodingRunBody`. `BunnyAgent.buildCommand` emits
  `--fork-from <id>` when set, so CLI-mode consumers can also snapshot-clone.
- `@bunny-agent/sdk` — add `forkFrom` to `BunnyAgentRunnerOptions`. Both
  the daemon path (`buildCodingRunBody`) and the CLI/agent-stream fallback
  now forward the field.
- `apps/runner-cli` — add `--fork-from <session-id>` flag, threaded into
  `runAgent`.
- `apps/daemon` (from the earlier PR) already accepts `forkFrom` on
  `/api/coding/run`.

Without this SDK-layer plumbing, `createBunnyAgent({ forkFrom: … })` would
be a type error — product apps (buda) can't reach the daemon feature that
already shipped.

## Motivation

Buda's "Save & Continue from shared session" flow triggers the fork on
the receiver's first turn in a cloned session. The kapps side calls
`createBunnyAgent(...)` (from `@bunny-agent/sdk`) rather than hitting the
daemon HTTP directly, so the SDK needs a first-class `forkFrom` option;
the manager needs to accept it in `StreamInput` for the CLI fallback path.

## Changes

- `packages/manager/src/types.ts`
  - `BunnyAgentCodingRunBody`: add `forkFrom?: string` (matches the daemon
    `RunRequest` field added earlier).
  - `StreamInput`: add `forkFrom?: string` — the CLI-mode entry point.
- `packages/manager/src/bunny-agent.ts`
  - `buildCommand`: append `--fork-from <input.forkFrom>` after `--resume`
    when set. Mutually exclusive at the runner level (pi ignores
    `--resume` when `--fork-from` is present), so this stays a
    fire-and-forget parameter here.
- `packages/manager/src/__tests__/bunny-agent.test.ts`
  - Covers both branches: `--fork-from` appears when
    `StreamInput.forkFrom` is set; and does not appear when unset.
- `packages/sdk/src/provider/types.ts`
  - `BunnyAgentRunnerOptions.forkFrom?: string`, mutually exclusive with
    `resume` at the runner level.
- `packages/sdk/src/provider/bunny-agent-language-model.ts`
  - `buildCodingRunBody`: include `forkFrom: this.options.forkFrom` in the
    request body for the daemon path.
  - CLI fallback (`agent.stream({ ... })`): forward `forkFrom` too, so
    both transport modes behave the same.
- `packages/sdk/src/__tests__/tool-refs.test.ts`
  - Adds a case that captures the daemon body and asserts
    `forkFrom: "sess_source_abc"` is on the wire.
- `apps/runner-cli/src/cli.ts`
  - `--fork-from <session-id>` option in the parser, help text, and
    dispatched into `runAgent`.

## Verification

- `pnpm -r typecheck` — clean (manager built first so downstream tsconfigs
  see the new field via `dist/*.d.ts`)
- `pnpm run -w lint` — clean
- `pnpm --filter @bunny-agent/manager test` — 87 pass
- `pnpm --filter @bunny-agent/sdk test` — 22 pass (new forkFrom body test)
- `pnpm --filter @bunny-agent/runner-cli test` — 24 pass

## Follow-up

- kapps (buda) `continueFromSharedSession` + `chat-service.ts` will set
  `forkFrom` on the first turn of a cloned session, once this cut is
  published (0.9.49-beta.1 or similar).
