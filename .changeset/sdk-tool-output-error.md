---
"@bunny-agent/sdk": patch
---

fix(sdk): translate `tool-output-error` SSE events into `tool-result` V3 stream
parts with `isError: true`.

When a tool-ref runtime fails, runner-pi now emits a `tool-output-error` chunk
(AI SDK v6 UI message protocol). The language-model provider previously only
handled `tool-output-available`, so the error was silently dropped and AI SDK
downstream saw the tool as successful with no output.

Map `tool-output-error` to a `LanguageModelV3Content` tool-result with
`isError: true`, carrying the `errorText` as the result payload. AI SDK
`streamText` upgrades that into a `tool-error` stream part, which the UI
message transform then re-emits as `tool-output-error` for the client.
