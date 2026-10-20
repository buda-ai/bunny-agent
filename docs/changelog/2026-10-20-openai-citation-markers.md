# Use OpenAI citation-formatting markers

Date: 2026-10-20

## Changes

- Replace the custom model marker grammar with OpenAI's recommended U+E200
  start, `cite` family, U+E202 separators, and U+E201 stop.
- Expose a complete copyable Citation Marker and `turnNurlI` reference with each
  Pi and harness search result. Increment turns once per search invocation,
  including failures and empty results, and retain canonical hashes internally.
- Share Pi tool and stream reference allocation and persist branch-aware
  reference mappings and invocation counters across resume, compaction, and fork.
- Resolve single and multiple source markers using exact registered references;
  preserve code literals and bound streaming buffers, source and annotation work.
- Remove legacy custom-marker and compact-hash alias interpretation. URL search
  results do not expose line locators, so fabricated locator fields are rejected.
- Keep flat Responses-shaped URL annotations with explicitly declared Bunny
  Unicode code-point ranges and provenance. Native annotation capability remains
  false; this change does not claim to implement the full Responses API.

## Validation

- Complete Pi, harness and SDK suites pass: 24 files / 334 tests, 4 files / 38
  tests and 16 files / 135 tests respectively (507 tests total).
- Pi, harness and SDK package typechecks and dependency/runtime builds pass.
- Changed TypeScript files pass Biome and diff checks. Coverage includes the
  new grammar, Unicode boundaries, multi-source references, branch-aware
  persistence, interrupted prefixes and obsolete syntax rejection.
- A fresh SDK → daemon → Pi → OpenAI model → real Tavily run returns five search
  results and two valid citations. Exact ranges following an emoji and final
  UIMessage JSON replay pass. Successful real Brave execution is not claimed.

## Reference

https://developers.openai.com/api/docs/guides/citation-formatting
