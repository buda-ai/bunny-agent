---
"@bunny-agent/sandbox-sandock": patch
---

Fix the bootstrap runner path: `@bunny-agent/runner-cli` publishes its bin as `bunny-agent-runner`, not `bunny-agent`. Fresh sandboxes (non-`skipBootstrap`) previously failed their first run with "bunny-agent: not found".
