---
"@bunny-agent/sdk": patch
---

Daemon coding runs on exec-based sandboxes (`LocalMachine`, `LocalSandbox`,
`SrtSandbox`) are no longer killed by the sandbox's default command timeout.
Every agent run longer than 5 minutes in local or self-hosted mode failed with
"Command timed out after 300000ms"; runs now end when they finish or when
the abort signal fires. Sandock streams coding runs natively and is unaffected.
