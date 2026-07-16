# Fix pre-prompt compaction continuation

## Summary

BunnyAgent's patched `@earendil-works/pi-coding-agent@0.78.0` no longer calls `agent.continue()` after proactive compaction performed immediately before a new user prompt.

## Root cause

When a resumed long-running session needed compaction before accepting the next prompt, Pi compacted the transcript and then called `agent.continue()`. The compacted context could still end with an assistant message, causing the deterministic failure:

```text
Cannot continue from message role: assistant
```

The pending user prompt was never submitted, so retrying the same resumed session repeated the failure.

## Fix

The pre-prompt path now performs compaction and proceeds directly to the pending user prompt. Post-response retry and overflow continuation behavior remains unchanged.

This backports upstream Pi commit `73581ea995e5e2abae51fc29cf535f42b7d31403` to the existing BunnyAgent dependency patch.
