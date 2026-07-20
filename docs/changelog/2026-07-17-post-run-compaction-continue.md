# Guard post-run continuation from assistant-tailed sessions

## Summary

BunnyAgent's patched `@earendil-works/pi-coding-agent@0.80.7` now guards every continuation requested by Pi's post-run retry/compaction handler. It does not call `agent.continue()` when the rebuilt transcript ends with an assistant message and no steering or follow-up messages remain.

## Root cause

Pi's post-run loop asks `_handlePostAgentRun()` whether more work should run, then calls `agent.continue()`:

```ts
while (await this._handlePostAgentRun()) {
  await this.agent.continue();
}
```

Compaction and retry rebuild or trim the in-memory transcript. In affected sessions that transcript can still end with an assistant message while both queues are empty. Calling `continue()` from that state fails deterministically:

```text
Cannot continue from message role: assistant
```

Because the failed continuation may be persisted as another assistant error, later prompts can encounter the same stale assistant-tailed state and repeat the failure.

## Fix

All post-run continuations now go through a guarded helper:

```ts
async _continueAgentIfPossible() {
  const lastMessage = this.agent.state.messages.at(-1);
  if (!lastMessage ||
      (lastMessage.role === "assistant" && !this.agent.hasQueuedMessages())) {
    return false;
  }
  await this.agent.continue();
  return true;
}
```

The loop stops if there is nothing valid to continue. Valid overflow retries still continue from a non-assistant tail, and queued steering/follow-up messages are still consumed from an assistant tail.

## Upstream status

As of `@earendil-works/pi-coding-agent@0.80.10` and upstream `earendil-works/pi` main on 2026-07-17, post-run continuation is still unguarded. The issue is tracked upstream in [#5463](https://github.com/earendil-works/pi/issues/5463), with related retry and queue-race variants described in [#5445](https://github.com/earendil-works/pi/issues/5445), [#5212](https://github.com/earendil-works/pi/issues/5212), and the broader lifecycle discussion in [#5886](https://github.com/earendil-works/pi/issues/5886).
