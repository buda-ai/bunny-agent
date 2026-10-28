# Configurable Web Search URLs

- Add optional `BRAVE_SEARCH_URL` and `TAVILY_SEARCH_URL` overrides for the
  `web_search` tool; unset values fall back to the vendor defaults
  (`https://api.search.brave.com/res/v1/web/search` and
  `https://api.tavily.com/search`).
- The overrides are full request URLs — no path is appended by the runner.
- Apply the same override support to both web search implementations:
  `packages/runner-pi/src/web-tools.ts` and
  `packages/runner-harness/src/tools/web-search.ts`.
- Expose the overrides through `RunnerEnvParams` / `buildRunnerEnv`
  (`packages/manager/src/env.ts`), keeping explicit params ahead of
  `process.env`. Unlike the request-scoped API keys, these are inherit-able
  config values (not secrets) so a daemon-level value reaches the runner.
- Document both overrides in `.env.example` as gateway/proxy endpoints.
- Add tests for default values, override resolution, empty-string fallback,
  request routing, and manager env plumbing.
