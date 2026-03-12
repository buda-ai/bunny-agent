# Propagate Tool Execution Errors via isError Flag in SSE Stream

## Summary

Fixed an issue where `tool-output-available` events in the SSE stream were not properly communicating when a tool execution failed.

## Changes

### Pi Runner (`packages/runner-pi`)

- Extract `isError` flag from `tool_execution_end` events emitted by `@mariozechner/pi-agent-core`
- Append `isError` to the Data Stream Protocol JSON payload so the Vercel AI SDK can correctly render tool errors

### Codex Runner (`packages/runner-codex`)

- Added logic to `toToolEndPayload` to calculate `isError` based on:
  - `exit_code !== 0` for shell commands
  - `status === 'failed'` or presence of an `error` object for MCP tool calls

### Tests

- Added unit tests for pi-runner verifying `isError: true` is emitted on tool failures
- Added unit tests for codex-runner verifying `isError` calculation for both shell and MCP tool results
