---
"@bunny-agent/runner-cli": minor
"@bunny-agent/daemon": minor
---

Upgrade the Pi runtime to `@earendil-works/pi-*@1.2.0` and `pi-mcp-adapter@5.3.0`.
Long single-prompt runs now compact between turns instead of overflowing the
provider context window, and gateway "Context Window exceeded" errors
trigger compact-and-retry recovery.
