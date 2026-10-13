---
"@bunny-agent/manager": patch
---

Allow the `web_search` tool to target custom Brave and Tavily endpoints via
`BRAVE_SEARCH_URL` and `TAVILY_SEARCH_URL`, forwarding the overrides to the
runner env and falling back to the vendor defaults when unset.
