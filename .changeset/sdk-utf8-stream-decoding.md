---
"@bunny-agent/sdk": patch
---

Decode the runner SSE stream with a single streaming `TextDecoder`, so a
Chinese character or emoji split across two network chunks no longer turns
into U+FFFD replacement characters in replies and tool output.
