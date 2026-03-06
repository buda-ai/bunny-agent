# Pi runner: --resume as sessionId and sessionId from messages in SSE stream

## Summary

Wire Pi runner to the same session flow as Claude: `--resume` is passed as Pi's `sessionId`. The Pi runner does **not** construct a sessionId; it only emits `sessionId` in the SSE stream when it gets one from the Pi runner's messages (agent state) or from the request (--resume).

## Changes

- **apps/runner-cli/src/runner.ts**
  - When creating the Pi runner, pass `options.resume` as `sessionId` so `--resume <id>` becomes the Pi Agent's sessionId.

- **packages/runner-pi/src/pi-runner.ts**
  - Set `agent.sessionId` only when `options.sessionId` is provided (from --resume); do not generate one.
  - Do not emit `message-metadata` with sessionId at stream start.
  - When processing the **agent_end** event (from the Pi runner's message stream), read sessionId from `agent.sessionId` or `options.sessionId`; if present, emit one `message-metadata` event with that sessionId so the SDK and frontend can capture it and send it back as `resume` on the next request.
  - Removed `randomUUID()` / generated session id.

## Behavior

- **SessionId source**: Only from the agent (after run, so provider can set it) or from the request (--resume). Never constructed by the runner.
- **When emitted**: On `agent_end`, so the stream carries sessionId from the Pi runner's messages/state. Frontend can read it and send as `resume` next time.
- **Resume**: Request with `resume` → CLI `--resume` → Pi `sessionId`; agent uses it and the same id is emitted again at agent_end.
