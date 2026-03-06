# Cleaner error display in UI

## Summary

When the runner subprocess failed, the chat UI showed a long, noisy error (command exit code, "stderr:", "[Runner] Signal handlers registered", then the real message). This made the actual cause hard to see.

## Changes

- **packages/manager/src/local-sandbox.ts**
  - On non-zero exit: full stderr is still logged once to the server console for debugging.
  - The thrown error (shown in the UI) is now a short user-facing message that shows **where it actually failed**:
    - We take the last stderr line that looks like an error (contains "error", "Error", "Fatal", "TypeError", "SyntaxError", "Exception"), or the last non-empty line if none match.
    - That line is shown in the UI (trimmed to 500 chars). No fixed prefix required.
    - If there was no stderr, we throw a brief "Command failed (exit N)."

## Behavior

- UI shows one clear line with the real error (e.g. "Fatal error: Pi runner: unsupported model ..." or "TypeError: ..."), not the full stderr dump.
- Server logs still contain the full stderr for debugging.
