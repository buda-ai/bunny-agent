# Upgrade Pi runtime for pre-prompt compaction fix

## Summary

BunnyAgent now uses `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, and `@earendil-works/pi-coding-agent` version `0.80.7`.

Pi `0.80.7` includes the upstream fix that avoids calling `agent.continue()` after proactive compaction immediately before a new user prompt.

## Root cause

When a resumed long-running session needed compaction before accepting the next prompt, the older Pi runtime compacted the transcript and then called `agent.continue()`. The compacted context could still end with an assistant message, causing the deterministic failure:

```text
Cannot continue from message role: assistant
```

The pending user prompt was never submitted, so retrying the same resumed session repeated the failure.

## Changes

- Upgrade all directly consumed Pi packages from `0.78.0` to `0.80.7`.
- Remove the local backport for the pre-prompt compaction fix because it is included upstream.
- Regenerate the `pi-coding-agent` pnpm patch against `0.80.7`, retaining only BunnyAgent's `.bunny` config directory and custom system-prompt behavior.
- Import the deprecated static model catalog through Pi's explicit compatibility entrypoint required by `0.80.7`.
- Update the Pi runner test mock to match the compatibility entrypoint.
