# Durable HTTP control for live Pi steering

Date: 2026-10-16
Author: Caedman Lan
AI Agent: Claude Sonnet 5 for implementation; Codex for review and validation

The coding server now exposes `POST /api/coding/control` alongside `/api/coding/run`. Both the standalone daemon and embedded Next.js adapter use the same registry and control handlers. SDK options forward the optional control descriptor, and the runner harness passes the live controller callback to Pi.

## Protocol

A controlled run supplies `{version: 1, runId, token}`. The run ID addresses one run; the token is a private bearer credential with at least 32 bytes of entropy. Control requests carry their credentials in JSON bodies, never URLs.

- `capabilities` reports version-1 Pi support. Authenticated status includes readiness, runner, model, epoch and retained receipts.
- `steer` submits a stable-ID text/image message. Its response has one `receipt`; status responses have a `receipts` array.
- `status` reconciles delivery without sending the message again.

Receipts distinguish `accepted`, `consumed`, `handled`, `rejected` and `uncertain`. Acceptance does not imply model-input consumption. Repeating the same ID and canonical payload returns the retained result; changing its payload conflicts. Wrong or unknown credentials return a generic 404, malformed requests return 400, and unsupported/not-ready/closed/conflicting operations return 409. Parse errors do not reflect request content or credentials.

## Persistence and ownership

The registry requires a usable filesystem journal before allowing controlled model side effects. If durable storage is unavailable, controlled runs fail closed and ordinary uncontrolled runs remain available.

Journal directories and files use private permissions. Paths hash run and message IDs, and only a token digest is stored. An exclusive owner claim fences competing daemon instances and prevents run-ID reuse. Receipt writes serialize and terminal states cannot regress. Symlink and nonprivate-path checks prevent unsafe journal locations.

Closed or restarted registries can return retained terminal receipts after authentication. An accepted receipt with no live owner able to confirm consumption is presented as uncertain. Recovery does not dispatch another native message or rewrite another live daemon's receipts. Asynchronous receipt-write failures also leave delivery unresolved.

Pi's native controller correlates one captured user message with the final provider-call boundary using opaque serializable metadata that survives context cloning. That metadata is removed before provider forwarding. See [Pi safe-boundary live steering](2026-10-16-pi-native-steering.md) for the native correlation and disposal contract.

## Validation

208 focused tests pass across the Pi runner/controller, journal, registry, HTTP routes, SDK forwarding, runner harness and both daemon adapters. The changed production entrypoints pass a scoped TypeScript check using the repository's Node 20 declarations.

An actual local HTTP run with a real Pi slow shell tool verifies safe-boundary consumption, same-ID deduplication, payload conflict, post-close/restart reconciliation and credential secrecy. Two actual Buda browser stories additionally verify fresh and selected steering: S reaches the next request once, A/B remain ordered for the next run, and steering creates no replacement run.

This is a coordinated source change with Buda PUL-355. No package release or deployment is implied. Production remote sandbox persistence and standalone CLI sessions were not exercised. Consumption confirms provider-input inclusion, not model obedience or exactly-once provider processing.
