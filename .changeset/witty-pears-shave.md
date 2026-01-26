---
"@sandagent/sandbox-daytona": patch
"@sandagent/sandbox-sandock": patch
"@sandagent/ui": patch
"@sandagent/ai-provider": patch
"@sandagent/sandbox-e2b": patch
"@sandagent/manager": patch
"@sandagent/runner-cli": patch
---

- Merge sandbox-local package into @sandagent/manager as built-in LocalSandbox
- Remove unused agentTemplate option from all sandbox adapters (E2B, Sandock, Daytona)
- Fix kui component exports