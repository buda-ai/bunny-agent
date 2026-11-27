---
"@bunny-agent/runner-pi": patch
"@bunny-agent/daemon": patch
"@bunny-agent/runner-harness": patch
---

Keep gateway models that are missing from the bundled Pi catalog on the right
request shape. `gpt-6.2-sol` and `gpt-6.2-astra` stay on the Responses API with
the GPT-6 profile instead of silently falling back to Chat Completions, every
self-registered model now sends session-affinity headers so a gateway can route
a conversation to the replica holding its prompt cache, and
`PI_DYNAMIC_MODEL_API` can override the endpoint without a release.
