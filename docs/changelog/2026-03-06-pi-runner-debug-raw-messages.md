# Pi runner: debug mode to save raw messages (like Claude runner)

## Summary

When `DEBUG=true` (or `DEBUG=1`), the Pi runner now appends each raw agent event to a JSON-lines file in the runner cwd, similar to the Claude runner’s `claude-message-stream-debug.json`.

## Changes

- **packages/runner-pi/src/pi-runner.ts**
  - Added `traceRawMessage(debugCwd, data, reset?)`: if `process.env.DEBUG === "true"` or `"1"`, appends one JSON object per line to `pi-message-stream-debug.json` under `debugCwd` (runner cwd). Each entry has `_t` (ISO timestamp), `type` (event type), and `payload` (serialized event; or `"[non-serializable]"` if JSON fails).
  - At the start of each `run()`, call `traceRawMessage(cwd, null, true)` to clear the file for the new run.
  - After each event is dequeued, call `traceRawMessage(cwd, event)` so all Pi agent events (message_update, tool_execution_start/end, agent_end) are recorded.

## Behavior

- Set `DEBUG=true` (or `1`) in the runner’s environment (e.g. in Settings or sandbox env). Each run writes to `<cwd>/pi-message-stream-debug.json`; the file is reset at the start of a run and appended with one JSON object per event. Use for debugging Pi agent stream behavior.
