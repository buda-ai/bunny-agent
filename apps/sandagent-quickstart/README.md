# SandAgent Quickstart

Get an AI agent chat running in a few minutes.

A minimal Next.js chat app showing how to run an agent via `@sandagent/sdk` (local sandbox).

> Note: this is a demo app (`"private": true`) and is not published to npm. Run it from the repo.

## Quick Start

### 1. Install dependencies

```bash
# From monorepo root
pnpm install
```

### 2. Configure API key

Create a `.env.local` file:

```bash
ANTHROPIC_API_KEY=sk-ant-your-key
```

### 3. Run

```bash
pnpm --filter @sandagent/quickstart dev
```

Open http://localhost:3000

## Customize the Agent

Edit `agent/CLAUDE.md` to define the agent’s role:

```markdown
# My AI Assistant

You are a helpful assistant...
```

Add skills under `agent/.claude/skills/`.

## Project structure

```
├── app/
│   ├── page.tsx           # Chat UI
│   └── api/ai/route.ts    # Backend API
├── agent/
│   ├── CLAUDE.md          # Agent role
│   └── .claude/skills/    # Skills
└── lib/
    └── artifact-processor.ts  # Artifact processor
```

## AskUserQuestion (user Q&A)

When the agent needs to ask the user questions during a run, it uses the `AskUserQuestion` tool. To add this feature:

1. **Add the answer API route** — Create `app/api/answer/route.ts` that receives `{ toolCallId, questions, answers }` and calls `submitAnswer(sandbox, ...)` with the same workdir as your chat sandbox.
2. **Add the UI component** — Use `useAskUserQuestion` from `@sandagent/sdk/react` and render it for dynamic tool parts with `toolName === "AskUserQuestion"`.
3. **Render in the chat page** — When rendering message parts, detect `AskUserQuestion` and render your `AskUserQuestionUI` component.

**Full step-by-step guide (developer):** [docs/ASK_USER_QUESTION_QUICK_START.md](../../docs/ASK_USER_QUESTION_QUICK_START.md)

**Approval file path:** The runner polls for answers at `{workdir}/.sandagent/approvals/{toolCallId}.json`.

## Dependencies

```json
{
  "@sandagent/sdk": "^0.2.0-beta.5",
  "ai": "^6.0.19"
}
```

## Next steps

- [SDK Quick Start](../../docs/SDK_QUICK_START.md)
- [SDK Development Guide](../../docs/SDK_DEVELOPMENT_GUIDE.md)
- [AskUserQuestion Quick Start](../../docs/ASK_USER_QUESTION_QUICK_START.md)
- [AskUserQuestion UI](../../docs/ASK_USER_QUESTION_UI.md)
- [Approval file (data contract)](../../docs/ASK_USER_QUESTION_APPROVAL_FILE.md)
- [E2B / cloud sandbox](../../packages/sandbox-e2b/README.md)
