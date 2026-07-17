# Fix post-run compaction continuation

## Summary

BunnyAgent's patched `@earendil-works/pi-coding-agent@0.80.7` no longer calls `agent.continue()` after threshold auto-compaction finishes a normal assistant turn with no queued work.

## Root cause

Pi's post-run handler treated every successful compaction as a reason to continue the agent:

```ts
if (await this._checkCompaction(msg)) {
  return true;
}
```

Threshold compaction can complete after a final assistant response without adding a user, steering, or follow-up message. The subsequent `agent.continue()` therefore received an assistant-tailed transcript with empty queues and failed deterministically:

```text
Cannot continue from message role: assistant
```

This is distinct from the pre-prompt compaction path fixed previously. It occurs after the response has completed, most often in long sessions crossing the automatic compaction threshold.

## Fix

After a successful post-run compaction, continue only when an `agent_end` handler queued steering or follow-up work:

```ts
if (await this._checkCompaction(msg)) {
  return this.agent.hasQueuedMessages();
}
```

Overflow recovery remains unchanged: Pi removes the overflow error message before retrying and returns through its existing retry path.

## Upstream status

As of `@earendil-works/pi-coding-agent@0.80.10` and upstream `earendil-works/pi` main on 2026-07-17, this exact unconditional continuation is still present. The issue is tracked upstream in [#5463](https://github.com/earendil-works/pi/issues/5463) and the broader lifecycle discussion in [#5886](https://github.com/earendil-works/pi/issues/5886).
