# Tool Overrides: Bash + Read Secret Redaction + Web Search/Fetch

## Changes

- **`packages/runner-pi/src/tool-overrides.ts`**: Consolidated all tool override logic into this module.
  - Moved `buildEnvInjectedBashTool` from `pi-runner.ts` into `tool-overrides.ts` (was previously inline).
  - Added `buildSecretRedactingReadTool`: overrides pi's built-in `read` tool to redact secrets from file content before the LLM sees them.
  - Added `buildSecretAwareTools` convenience function that returns bash, read, web_search, and web_fetch overrides.
  - Shared `redactResultContent` helper to avoid duplication between bash and read redaction.

- **`packages/runner-pi/src/web-tools.ts`**: New file. Multi-provider web search with auto-detection.
  - `WebSearchProvider` interface for pluggable search backends.
  - Three providers: Brave (BRAVE_API_KEY), Tavily (TAVILY_API_KEY), DuckDuckGo (no key, fallback).
  - `resolveSearchProvider()` auto-detects the best provider from available env keys.
  - `web_search` tool: query, count, freshness, country, fetch_content params. Includes promptSnippet/promptGuidelines.
  - `web_fetch` tool: lightweight URL→text extractor (50KB limit, no heavy deps).
  - Tool names chosen for cross-model compatibility (Claude, Gemini, GPT all understand `web_search`/`web_fetch`).
  - DuckDuckGo always available as zero-config fallback so web_search is always registered.

- **`packages/runner-pi/src/pi-runner.ts`**: Simplified by importing `buildSecretAwareTools` from `tool-overrides.ts` instead of defining `buildEnvInjectedBashTool` inline. The `customTools` array now includes all overrides.
