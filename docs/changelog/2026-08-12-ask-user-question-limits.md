# AskUserQuestion Limits

## Changes

- Increased the default interactive question timeout from 60 seconds to 3 minutes in the Claude and Pi runners.
- Limited Pi `ask_user_question` surveys to a maximum of 8 questions in the tool schema.
- Added defensive runtime validation in both runners so oversized surveys never reach the approval bridge or frontend.
- Exported the shared maximum-question constants for integrations and tests.
- Added focused regression coverage for the timeout defaults, Pi schema, and oversized survey rejection.

## Compatibility

- Per-run `askUserQuestionTimeoutMs` overrides continue to take precedence over the default.
- Claude Agent SDK currently limits its built-in `AskUserQuestion` tool to 4 questions, which remains within Bunny Agent's maximum of 8.
- Ordinary tool approvals remain unbounded unless callers explicitly configure a timeout.
