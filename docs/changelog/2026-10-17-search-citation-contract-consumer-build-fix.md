# Search citation contract: SDK source consumer build repair

Date: 2026-10-17

## Problem

After the runner-pi repair, GitHub's full build progressed to the Next.js web
application and failed to resolve the new SDK import `../contracts.js`. The
workspace SDK exports TypeScript source, and Turbopack does not resolve these
explicit internal `.js` paths to the new `.ts` files. Earlier compiled-package
checks did not exercise this source consumer.

Actual SDK package checks also revealed two portability problems in a new test:
its direct ReadableStream async iteration required a library declaration absent
from the package configuration, and a browser-bundle assertion depended on the
current working directory used to report esbuild input paths.

## Change

- Match the SDK's existing extensionless internal import style in the language
  model and the public contracts entry. Published build outputs remain ESM.
- Collect the test stream with its standard reader API, without changing the
  production library configuration or casting away the stream type.
- Keep the browser-platform bundle and fresh-process JSON replay/projection
  assertions; remove the working-directory-dependent input filename assertion.

## Validation

All checks used the fresh filtered workspace installation from the committed
lockfile and actual package configuration, without source aliases or compiler
option overrides:

- The actual Next.js production build passed, including compilation, TypeScript
  checks, static generation, and route output.
- The SDK ESM/declaration build passed with cleanup explicitly disabled.
- The SDK package typecheck passed.
- All 12 SDK test files / 96 tests passed, including fresh-process browser
  projection replay, actual AI SDK mapping, and compiled peer compatibility.
- Scoped Biome checks passed for all three changed TypeScript files.

Local verification used Node v24.20.0; GitHub uses Node 22 and its workflow
results are tracked separately. The earlier Pi verification passed its original
ES2020 build/typecheck and 23 files / 325 tests. No fresh model/provider run is
claimed. OpenSpec remains 30/31 complete, with real Tavily task 7.2 pending.
