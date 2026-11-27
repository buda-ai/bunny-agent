---
"@bunny-agent/runner-pi": patch
"@bunny-agent/runner-cli": patch
"@bunny-agent/daemon": patch
"bunny-agent": patch
---

Upgrade the Pi runtime to `@earendil-works/pi-*@1.6.1`.

Pi 1.6.0 adds GPT-6.2 Sol and GPT-6.2 Astra to its bundled catalog, so a
renamed model id no longer has to be re-declared locally. Both run on the
Responses API with the 272K/128K profile, which restores session affinity and
`prompt_cache_key` for gateway traffic — the 1.3.0 catalog did not know them and
they silently fell back to Chat Completions.

The upgrade also retries more gateway failures (Cloudflare 525, "provider is
temporarily unavailable", partial responses, `finish_reason: "error"`), no
longer drops GPT-6.2 reasoning as `prefix_mismatch`, sends `system` role system
messages to OpenAI-compatible providers other than OpenAI, and stops an
unrelated `plugin_request_too_large` error from triggering compact-and-retry.
