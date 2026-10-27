---
"@bunny-agent/daemon": patch
---

Expose durable Pi steering capability alongside search contracts in `/healthz`,
using the coding run/control registry's shared journal initialization. Include a
stable per-instance ID so clients can retain health capability results until a
daemon instance is replaced. Preserve legacy control capability requests.
