---
"@bunny-agent/runner-pi": patch
---

fix(runner-pi): throw on tool-ref runtime errors instead of returning them as
text content.

`buildToolDefinitionsFromRefs` previously returned non-2xx HTTP responses and
transport failures as a normal `{ content: [{ type: "text", text }] }` result,
which violates the pi-agent-core `AgentTool.execute` contract ("throw on
failure instead of encoding errors in content"). The pi-runner could not mark
the call as an error, and downstream SSE consumers (e.g. Buda) saw the tool as
successful with the error text as its output.

Both error paths now throw a `PiToolRefError` carrying the tool name, HTTP
status, and body, so the runner emits a proper tool-error event and the UI can
render a failure state.
