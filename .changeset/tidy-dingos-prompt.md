---
"@bunny-agent/daemon": patch
"@bunny-agent/runner-cli": patch
---

Upgrade the Pi runtime to 0.80.7 so resumed sessions use the upstream pre-prompt compaction fix and submit the pending user prompt instead of continuing from an assistant-tailed transcript.
