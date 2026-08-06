# Ask User Question Tool Name Alignment

Date: 2026-08-06

## What Changed

- Registered Pi's interactive question tool with the canonical `ask_user_question` name used by product allowlists and prompts.
- Normalized the legacy `AskUserQuestion` allowlist name for backward compatibility.
- Preserved legacy approval-file recognition so historical CamelCase tool calls still expose their questions.
- Added focused regression coverage for canonical registration and legacy compatibility.

## Why

Pi activates custom tools by exact allowlist name. Products such as Buda allowed `ask_user_question`, while the Pi runner registered `AskUserQuestion`, so the tool was registered but inactive and the model reported that it was unavailable.

## Verification

- `pnpm --filter @bunny-agent/runner-pi exec vitest run src/__tests__/pi-runner.test.ts src/__tests__/tool-approval.test.ts` passed with 58 tests.
- Linting and typechecking were intentionally skipped for PR publication at the user's request.
