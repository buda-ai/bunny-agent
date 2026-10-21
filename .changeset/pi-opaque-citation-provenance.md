---
"@bunny-agent/runner-cli": patch
"@bunny-agent/daemon": patch
---

Preserve opaque provider tool-call IDs when registering and restoring citation
sources. Valid search results with IDs longer than 1,024 characters now resolve
their citations instead of losing source provenance.
