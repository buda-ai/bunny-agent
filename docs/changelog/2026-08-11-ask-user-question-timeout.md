# AskUserQuestion Timeout

## Changes

- Added a 60-second default timeout for interactive `AskUserQuestion` calls in the Pi and Claude runners.
- Converted unanswered question timeouts into model-visible tool results so the agent continues the conversation instead of remaining blocked.
- Preserved partial answers and included an explicit timeout marker for the model.
- Kept ordinary tool approvals waiting indefinitely unless they are aborted.
- Added a per-run `askUserQuestionTimeoutMs` override through the runner harness.
- Added focused timeout coverage for both runner implementations.
- Verified that the runner harness forwards the timeout override to Claude and Pi.
- Updated the AskUserQuestion documentation with the default timeout and continuation behavior.
- Updated the daemon build to rebuild its workspace runner dependencies before bundling, preventing stale runner code from being served locally.
- Added daemon API forwarding for `askUserQuestionTimeoutMs` and regression coverage for the request contract.
- Added a per-run timeout latch so repeated AskUserQuestion calls return immediately after the first timeout instead of opening another blocking wait.

## Local Runtime Diagnosis

- Reproduced the reported task at `http://localhost:3000/agents/agt_mk_social/tskZkNYaRqKHgTmzANo`.
- Confirmed the task reached the outer five-minute command timeout because the daemon bundle still contained the previous indefinite AskUserQuestion wait implementation.
- Confirmed the first rebuilt timeout released after 60 seconds, then found and fixed a follow-up model retry that opened a second question card.

## Research

- Reviewed the repository lifecycle with DeepWiki and verified the current implementation directly because the indexed timeout behavior was stale.
- Compared human-in-the-loop timeout and rejection patterns from agent frameworks found through Exa, favoring a model-visible result over a suspended promise or terminal run failure.
