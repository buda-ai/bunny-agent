# Pi runner: include messageMetadata.usage in finish event

## Summary

The Pi runner now constructs and sends `messageMetadata` (with `usage`) in the **finish** SSE event, so the SDK receives a complete finish payload instead of undefined. This fixes the error "Cannot destructure property 'usage' of 'parsed.messageMetadata' as it is undefined" at the source: the runner sends the data the SDK expects.

## Changes

- **packages/runner-pi/src/pi-runner.ts**
  - Import `Usage` from `@mariozechner/pi-ai`.
  - Add `usageToMessageMetadata(usage)`: maps pi-ai `Usage` (input, output, cacheRead, cacheWrite) to the shape the SDK expects (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens).
  - Add `getUsageFromAgentEndMessages(messages)`: returns usage from the last assistant message in `agent_end.messages`.
  - `finishSuccess(usage?)`: when `usage` is provided, emit finish with `messageMetadata: { usage: usageToMessageMetadata(usage) }`.
  - On `agent_end`, extract usage via `getUsageFromAgentEndMessages(event.messages)` and pass it to `finishSuccess(usage)`.

## Behavior

- On successful run end, the Pi runner reads the last assistant message's `usage` from the agent's messages and includes it in the finish chunk. The SDK's `convertUsage` can then parse it without defensive checks for undefined `messageMetadata`.
