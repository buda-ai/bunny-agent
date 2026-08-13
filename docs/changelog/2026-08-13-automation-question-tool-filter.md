# Automation Question Tool Filter

## Changes

- Made the Pi runner's explicit `allowedTools` list authoritative for the native `ask_user_question` tool.
- Preserved the interactive default when callers omit `allowedTools`.
- Prevented unattended automation runs from receiving a tool that requires live user input.
- Added regression coverage for allowlists that intentionally exclude `ask_user_question`.

## Root Cause

- Buda already marks scheduled automation executions as non-web and omits `ask_user_question` from the runner allowlist.
- The Pi runner appended its native question tool after applying that allowlist, so automations could still block for the three-minute interactive timeout.

## Validation

- Run the focused Pi runner tests.
- Run the Pi runner typecheck.
