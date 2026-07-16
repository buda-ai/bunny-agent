---
"@bunny-agent/daemon": patch
"@bunny-agent/runner-cli": patch
---

Backport Pi's pre-prompt compaction fix so resumed sessions submit the pending user prompt instead of continuing from an assistant-tailed transcript.
