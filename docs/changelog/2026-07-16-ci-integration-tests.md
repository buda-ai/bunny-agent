# CI: live integration tests (local / srt / sandock × mock LLM)

Date: 2026-07-16

## Why

Every sandbox adapter's unit suite mocks its SDK, so an entire class of
breakage is invisible to CI — the sandock runner-bin bug
(`2026-07-16-sandock-runner-bin-fix.md`) shipped with 39/39 unit tests green
and was only caught by a live run. This adds an opt-in live tier that
exercises real isolation and a real BunnyAgent turn end to end on every PR.

## What Changed

- `.github/workflows/integration.yml`, two jobs:
  - **local-srt**: installs bubblewrap + socat, relaxes Ubuntu 24.04's
    unprivileged-userns restriction on the ephemeral runner, fails loudly if
    the bwrap probe fails (instead of green-but-skipped), then runs the
    sandbox-local/sandbox-srt suites (REAL bwrap isolation) and the new live
    E2E in manager-cli.
  - **sandock**: runs the live sandock suite against sandock.ai using the
    `SANDOCK_API_KEY` repo secret; skips cleanly when the secret is absent
    (fork PRs).
- `apps/manager-cli/src/__tests__/live-e2e.test.ts` (opt-in via
  `BUNNY_INTEGRATION=1`): full `BunnyAgent.stream()` turn — attach, real
  runner-cli spawn, real HTTP — through LocalMachine and SrtSandbox, using
  the deterministic mock-ai-server (`https://mock-ai-server.vika.workers.dev`,
  OpenAI protocol; override with `MOCK_OPENAI_BASE_URL`) and the **pi**
  runner, so no LLM key and zero token cost. The SrtSandbox case allowlists
  only the mock host, which also proves srt's domain allowlist end to end.
- `packages/sandbox-sandock/src/__tests__/sandock-live.test.ts` (opt-in via
  `BUNNY_INTEGRATION=1` + `SANDOCK_API_KEY`): adapter round trip
  (attach/exec/upload/readFile) plus a full BunnyAgent turn through the
  npm-bootstrapped runner in a real cloud sandbox; always destroys the
  sandbox in `afterEach` (120s hook timeout — cloud teardown exceeds the 10s
  default).
- `apps/manager-cli` gains a `@bunny-agent/sandbox-srt` dependency.

## Gotchas encoded in the tests (found by running them for real)

- The AI SDK stream's SSE chunking can split a word across `text-delta`
  events (observed: `"mock-ai-serve" + "r, ..."`), so assertions join the
  deltas instead of matching the raw stream.
- srt removes the network namespace and injects `HTTP(S)_PROXY`; Node's
  fetch (undici) ignores those env vars, so the spawned runner needs
  `NODE_USE_ENV_PROXY=1` (Node ≥ 24) — otherwise every LLM call inside
  SrtSandbox fails with "Connection error." while curl works fine.
- pi stores sessions under `~/.bunny/agent/sessions`, which must be in
  srt's `allowWrite`.

## Testing

All live suites were run for real before landing:

- local-srt: 3/3 (LocalMachine turn 3.7s; SrtSandbox turn with only the mock
  host allowlisted).
- sandock: 2/2 against production sandock.ai (round trip + full turn,
  ~106s including sandbox create/destroy).
- Without `BUNNY_INTEGRATION` everything skips: `pnpm -r test` unchanged.
