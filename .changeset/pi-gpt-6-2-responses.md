---
"@bunny-agent/runner-pi": patch
---

Register `gpt-6.2-sol` and `gpt-6.2-astra` on the Responses API with the GPT-6
profile. The pinned pi-ai catalog does not know these ids, so they were
self-registered on Chat Completions, which sends no `prompt_cache_key` or session
headers to an OpenAI-compatible gateway and left their prompt cache mostly cold.
