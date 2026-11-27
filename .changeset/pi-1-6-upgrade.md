---
"@bunny-agent/runner-pi": patch
"@bunny-agent/runner-cli": patch
"@bunny-agent/daemon": patch
"bunny-agent": patch
---

Upgrade the Pi runtime to `@earendil-works/pi-*@1.6.1`.

Pi 1.6.0 adds GPT-6.2 Sol and GPT-6.2 Astra to its bundled catalog on the
Responses API with the 272K/128K profile, so the gateway models this repo serves
are recognised upstream instead of being re-declared. The local
`DYNAMIC_MODEL_PROFILES` entries stay as the fallback for a custom provider id,
which still misses the catalog lookup.

The upgrade also retries more gateway failures (Cloudflare 525, "provider is
temporarily unavailable", partial responses, `finish_reason: "error"`), no
longer drops GPT-6.2 reasoning as `prefix_mismatch`, sends `system` role system
messages to OpenAI-compatible providers other than OpenAI, and stops an
unrelated `plugin_request_too_large` error from triggering compact-and-retry.
