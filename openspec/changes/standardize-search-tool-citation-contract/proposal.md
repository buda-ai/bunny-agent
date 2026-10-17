## Why

BunnyAgent currently flattens web search results into provider-formatted text and loses structured answer citation metadata at runner/SDK boundaries. Prioritize the OpenAI Responses `output_text.annotations[].url_citation` convention requested by the user so applications can distinguish retrieved sources from evidence explicitly cited in an answer, instead of treating search cards or Markdown links as annotation support.

## What Changes

- Define a versioned, provider-neutral structured search result contract modeled on Responses `web_search_call.action.sources`, with stable source identities, explicit result availability, errors, and retained model-readable legacy text.
- Define the answer citation contract using the Responses field names and flat shape: `type: "output_text"`, `text`, and `annotations` containing `type: "url_citation"`, `start_index`, `end_index`, `url`, and `title`. Keep retrieval and answer annotations separate.
- Prefer validated native provider annotations. Add an explicit, source-ID-based citation marker bridge for Pi tools backed by Tavily/Brave/DuckDuckGo; resolve only model-authored references to known sources and never infer citations from arbitrary Markdown links or search snippets.
- Preserve structured output, URL sources, text identity, citation ranges, provenance, and capability information across runner SSE, daemon, SDK LanguageModelV3, and AI SDK UIMessage serialization. Unsupported runners must report limitations rather than invent citations.
- Introduce an opt-in versioned rollout, keeping current text-only clients operational until a consumer migration explicitly enables the new contract. The public default does not change in this phase.
- Publish protocol examples, regression fixtures, migration guidance, and a Buda consumer handoff. Existing kapps PR #8009 remains a search-source-card change; this proposal does not reclassify it as answer citation implementation.

## Capabilities

### New Capabilities

- `web-search-contract`: Versioned structured retrieval results, stable source IDs, explicit failure/missing-detail semantics, and legacy compatibility.
- `answer-url-citations`: Responses-shaped answer annotations with validated text offsets, native annotation priority, and an explicit citation bridge for non-native search tools.
- `citation-stream-transport`: Lossless transport through runner/daemon/SDK, AI SDK source parts and text metadata, capability reporting, and replay-safe serialization.

### Modified Capabilities

None. This OpenSpec root was initialized for this proposal and has no existing capability specifications.

## Impact

- Primary repository: `buda-ai/bunny-agent`, baseline `main@38c228c` (v0.9.62).
- Likely implementation areas: shared public contract types in `packages/manager`; search tools and structured result extraction in `packages/runner-harness` and `packages/runner-pi`; Pi stream conversion and citation bridge; Codex capability/fallback handling; SDK stream and generate mappings; coding-run configuration in `packages/server-ai-sdk`, daemon, and runner CLI.
- The installed `@earendil-works/pi-ai` adapter currently exposes text/text signatures without annotations. Native Responses support requires a supported provider adapter hook or upstream change; this dependency is an explicit acceptance gate, not assumed to exist.
- Downstream dependency: Buda Cloud/OpenBuda must separately consume the structured contract, persist text metadata/source IDs, and render clickable inline citations against original Markdown text. Those product UI/database changes belong to a follow-up kapps change outside this repository's apply scope.
- No search provider replacement, hosted-search backend addition, document-citation invention, KUI changes, deployment, or secret persistence. No immediate breaking change; removing legacy output or changing the default requires a separate versioned migration.
