---
"@bunny-agent/daemon": patch
"@bunny-agent/runner-cli": patch
---

Guard Pi's post-run continuations so assistant-tailed sessions with empty steering and follow-up queues settle instead of repeatedly throwing `Cannot continue from message role: assistant`.
