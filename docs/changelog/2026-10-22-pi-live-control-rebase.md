# Pi live control rebase

- Rebased PR #445 onto the latest `origin/main`.
- Preserved both search contract version selection and live steering registration across manager types, runner dispatch, Pi options, SDK requests, and server execution.
- Replaced `Object.hasOwn` with `Object.getOwnPropertyDescriptor` for an own-property check compatible with the package's TypeScript library target.
- Validation: workspace build and typecheck passed; Pi (415), SDK (138), harness (40), and server (94) tests passed. Daemon passed 128 tests with two existing streamed-upload failures reproduced against unmodified main source in an isolated worktree. The final live-control adjustment passed its 23 tests, Pi typecheck, and Biome check.
