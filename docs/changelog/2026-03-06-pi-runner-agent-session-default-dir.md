# Pi runner: AgentSession + SessionManager with default session dir (~/.pi)

## Summary

The Pi runner now uses pi-coding-agent's **AgentSession** and **SessionManager** for real multi-turn conversation and session persistence. Sessions use Pi's **default directory** (`~/.pi/agent/sessions/...`), so the workspace is not used for session files.

## Changes

### packages/runner-pi

- **createPiRunner** no longer creates a raw `Agent`; it uses **createAgentSession** from `@mariozechner/pi-coding-agent` inside **run()**.
- **SessionManager**: When `options.sessionId` (from `--resume`) is set, use **SessionManager.open(resume)** to resume that session file; otherwise **SessionManager.continueRecent(cwd)**. No custom `sessionDir` is passed, so the default `~/.pi/agent/sessions/--<encoded-cwd>--/` is used.
- **AgentSession**: Handles prompt, event subscription, and automatic session persistence (e.g. on message_end). System prompt is set via **session.agent.setSystemPrompt()** after creation.
- **Stream metadata**: Emit **message-metadata** with **sessionId** (UUID) and **sessionFile** (absolute path) so the client can send **sessionFile** as **resume** on the next request for multi-turn.
- **Lifecycle**: **session.dispose()** in `finally` after the run.

### packages/sdk

- **sandagent-language-model.ts**: Store and expose **sessionFile** from stream `message-metadata`; include **sessionFile** in **providerMetadata.sandagent** (text-start and finish) so the UI can use it for resume.
- **useSandAgentChat**: **getResumeFromMessage** now prefers **sessionFile** when present (for Pi), otherwise **sessionId**; the **resume** value sent in the request body is this so the Pi runner receives the session file path for resume.

## Behavior

- **First run (no resume)**: SessionManager.continueRecent(cwd) creates or continues the most recent session in the default dir for that cwd. Session is persisted to `~/.pi/...`.
- **Resume**: Client sends **resume: sessionFile** (from previous message’s providerMetadata.sandagent.sessionFile). Runner calls SessionManager.open(resume) and continues that session.
- **Multi-turn**: Each request runs in the same session (same file) when resume is used; the agent sees full history via SessionManager/buildSessionContext.
