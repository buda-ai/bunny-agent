---
"@bunny-agent/runner-pi": patch
"@bunny-agent/daemon": patch
"@bunny-agent/runner-harness": patch
---

Keep gateway models that are missing from the bundled Pi catalog on the right
request shape. A self-registered model now sends session-affinity headers, so a
gateway can route every turn of a conversation to the replica that holds its
prompt cache — before, only models the catalog recognised carried that header,
which is why the same gateway looked cached on `/v1/responses` and uncached on
`/v1/chat/completions`. `PI_DYNAMIC_MODEL_API` can move such a model to the
Responses endpoint without a release.
