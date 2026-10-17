---
"@bunny-agent/runner-cli": patch
"@bunny-agent/daemon": patch
---

Upgrade the Pi runtime to `@earendil-works/pi-*@1.3.0` and `pi-mcp-adapter@5.3.1`.
Pi now retries gateway "temporarily unavailable" / "unable to forward upstream"
errors (including during compaction), rejects tool calls whose arguments are
malformed JSON instead of running them with partial fields, no longer fails
Anthropic requests when an error tool result carries images, and caps leaked
codemode workers after repeated timeouts.

The MCP adapter is now loaded with jiti's transpile cache enabled: its
TypeScript sources took ~20s to compile on every new runner process, and now
take ~3s once the sandbox has compiled them once.
