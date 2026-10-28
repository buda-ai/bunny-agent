# Search capability discovery fails on exec-less sandbox adapters

Date: 2026-10-26

## Problem

Production Buda logs (`kapp_source_log`, deployment `buda`) showed a recurring
stream failure for agents running on the `buda-connector` runtime:

```
[Chat] phase5:stream-start { runner: 'pi' }
[ChatService] SandAgent daemon: { runtime: 'buda-connector', healthy: true }
[ERROR] [SandAgent] Stream error: Error: Search capability discovery failed (HTTP unknown).
```

270 occurrences over roughly three days, first appearing 2026-10-23T06:14Z.
Runs on `sandock` in the same window succeeded, so the failure correlated with
the runtime, not the agent or the model. The error rejected `doStream()`, so the
user's chat turn ended with no assistant output — not a degraded log line, a
dead turn.

`parseHealth` parses the curl output as `<body>\n<status>` and throws whenever
the trailing status is missing:

```ts
const status = /\n(\d{3})$/.exec(text);
if (!status || status[1] !== "200") {
  throw new Error(`Search capability discovery failed (HTTP ${status?.[1] ?? "unknown"}).`);
}
```

`HTTP unknown` therefore means the probe transport produced nothing that looked
like a status line. It did produce something, though. The discovery probe runs
`curl` through `handle.exec()`. That is correct for Sandock and local sandboxes,
which really do execute shell commands. Buda's connector adapter instead relays
the entire coding run to a daemon on the user's machine, and implements `exec`
only to satisfy `SandboxHandle`:

```ts
async *exec(_command: string[], _opts?: ExecOptions): AsyncIterable<Uint8Array> {
  yield encoder.encode(
    "buda-connector sandbox does not support ad-hoc exec; agent runs through the connector daemon.",
  );
}
```

So the probe parsed that diagnostic string, found no status line, and threw. The
root cause is a capability mismatch: `exec` is required by the interface but is
not a reliable signal that arbitrary commands can run.

## Change

- `packages/manager/src/types.ts`: add optional `supportsExec?(): boolean` to
  `SandboxHandle`, documented as "whether `exec` can actually run an arbitrary
  command". Omitting it means *assumed supported*, which keeps every existing
  adapter's behavior unchanged. Only adapters whose `exec` is a stub need to
  return `false`.
- `packages/sdk/src/provider/search-contract-discovery.ts`: add `canProbe()`
  and return `undefined` from `discoverPiSearchContract` when an adapter reports
  it cannot exec. An exec-less sandbox is reported as *no new search contract* —
  the same outcome already used for an old daemon — rather than as an error.
  URL validation still runs first, so a genuinely malformed daemon URL still
  surfaces as a configuration error instead of being silently skipped.

The probe was never going to succeed on such an adapter, and failing it killed a
valid turn. Reporting "no new contract" preserves the older behavior on that
runtime: the turn runs, without the enhanced citation contract.

## Verification

- New SDK tests cover the exec-less adapter (skips, `exec` never called), an
  unsafe URL on an exec-less adapter (still rejects), and an adapter that omits
  `supportsExec` (still probes, `exec` called once).
- Direct reproduction using Buda's byte-for-byte stub string: without
  `supportsExec` the probe rejects with the exact production message
  `Search capability discovery failed (HTTP unknown).`; with
  `supportsExec: () => false` it resolves to `undefined`.
- Full SDK suite: 141 tests across 17 files pass.
- `tsc --noEmit` clean for `@bunny-agent/manager` and `@bunny-agent/sdk` (after
  building sibling workspace packages).

## Follow-up

Buda must declare `supportsExec(): boolean { return false; }` on
`ConnectorSandboxHandle` and consume a released SDK containing this change;
until then the fix is inert on that runtime. Doing so restores chat turns for
connector users but leaves them without the Pi search citation contract — giving
connector sandboxes a real exec (or negotiating citations over the relay
instead) is a separate piece of work.
