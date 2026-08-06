# Restore runner alignment updates

Restore the runner-alignment changes after the previous main-branch revert.

## Included updates

- Surface Claude and Copilot context-compaction events through the SDK and web example.
- Add Pi tool approval with the shared file-based approval protocol.
- Add Claude tool references, skill plugins, and expanded authentication detection.
- Add ACP session resume support for Gemini and OpenCode.
- Align Copilot runner options, harness dispatch, SDK types, tests, and maturity documentation.

## Validation

- `git diff --cached --check`
- Linting was not run per request.
- Type checking was not run per request.
