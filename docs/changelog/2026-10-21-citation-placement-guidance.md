# Place citations after complete supported items

Date: 2026-10-21

## Changes

- Align Pi system guidance, Pi/harness web-search descriptions, prompt
  guidelines, and search-result instructions around semantic item endings.
- Put citation markers after the final punctuation of a complete supported
  sentence, bullet item, or paragraph. Prefer shorter complete sentences over
  markers between clauses, inside headings, or after linked source titles.
- Group distinct sources in one official marker at the end of the item; avoid
  duplicate source references and manual numbered markers.
- Prefer structured citations over duplicate Markdown links to supporting
  sources. Respect explicit requests for direct links or citation placement.
- Keep the parser, annotation positions, and stored answer text unchanged.
  Citation placement does not depend on physical screen line wrapping.

## Validation

- Pi system-guidance and web-search regressions pass all 57 tests.
- Harness web-search regressions pass all 25 tests.
- Both runner-pi and runner-harness typechecks pass.
- Changed TypeScript files pass Biome checks, and the diff passes whitespace
  checks.
- Rebuilt runners and daemon, then generated a fresh local Buda answer through
  Gemini 3.7 Flash and real web search. Its one valid citation appeared after
  the final punctuation of the supported item; the browser reported no page
  errors. An unresolved model reference was hidden by the existing consumer.
  This verifies one real output, not a guarantee for every model response.
