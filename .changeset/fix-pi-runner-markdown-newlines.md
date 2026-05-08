---
"@bunny-agent/runner-pi": patch
---

Fix markdown formatting corruption in streamed LLM text.

Previously, every `text_delta` emitted by the LLM was passed through
`redactSecrets()` which called `.trim()` on each delta. Providers that stream
in fine-grained chunks (e.g. GPT) often emit newlines as their own deltas
(`"\n\n"`, `"\n"`) or at chunk boundaries; trimming each chunk stripped those
newlines, causing block-level markdown (`###`, `---`, list items, paragraph
breaks) to appear inline and break the rendered output.

The secret-redaction on text deltas was also redundant: `bash` and `read`
tools already redact secrets at their source via `redactResultContent`, the
`env` dump command is blocked entirely, and secrets are injected via
`spawnHook` so they never reach LLM-visible output. Per-delta streaming
redaction was also unreliable since a secret split across chunks wouldn't
match.

Removed `redactText` from the stream converter entirely. Text deltas now
pass through unchanged; tool output normalization is unaffected.
