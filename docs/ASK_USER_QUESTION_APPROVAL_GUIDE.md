# AskUserQuestion Approval Guide

This guide consolidates **quick start**, **data structures**, and **architecture** for the AskUserQuestion approval flow. It is the single source of truth for developers.

## Overview

`AskUserQuestion` is a dynamic tool that lets the agent ask the user questions during a run. Your UI renders the questions and submits answers to an answer API. The runner waits for an **approval file** in the sandbox workdir, then continues with the collected answers.

## Architecture (File-Polling Approval)

```
┌─────────────────────────────────────────────────────────────┐
│  Runner (inside sandbox)                                     │
│  - Polls approval file every 500ms                          │
│  - Continues when status == "completed"                     │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│  Answer API (server)                                         │
│  - Receives { toolCallId, questions, answers }               │
│  - Writes approval file via submitAnswer()                  │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│  UI                                                         │
│  - Renders questions                                        │
│  - Submits answers on selection                             │
└─────────────────────────────────────────────────────────────┘
```

Key design points:

- The runner **does not create** the file. It only reads/polls it.
- The answer API **overwrites** the file on every update.
- If timeout occurs, the runner may continue with partial answers.

## Quick Start

### 1. Answer API (SDK: `submitAnswer`)

Use the **same workdir** as your chat sandbox.

```typescript
import path from "node:path";
import { LocalSandbox, submitAnswer, type Question } from "@sandagent/sdk";

export async function POST(request: Request) {
  const { toolCallId, questions, answers } = await request.json();

  const sandbox = new LocalSandbox({
    workdir: path.join(process.cwd(), "workspace"), // must match chat sandbox
  });

  await submitAnswer(sandbox, { toolCallId, questions, answers });
  return Response.json({ success: true });
}
```

### 2. Render the Tool in UI

Detect the tool part and render a component that uses `useAskUserQuestion`.

```tsx
import { useAskUserQuestion } from "@sandagent/sdk/react";
import type { DynamicToolUIPart } from "ai";

function AskUserQuestionUI({ part }: { part: DynamicToolUIPart }) {
  const {
    questions,
    answers,
    isCompleted,
    isWaitingForInput,
    selectAnswer,
    isSelected,
  } = useAskUserQuestion({
    part,
    answerEndpoint: "/api/answer",
  });

  // Render questions/options; call selectAnswer on click.
  return null;
}
```

### 3. Flow Summary

1. Agent emits `AskUserQuestion` tool call.
2. UI renders the tool and submits answers.
3. Answer API writes approval file via `submitAnswer`.
4. Runner reads the file, continues, and the tool becomes completed.

## Data Structures

### AskUserQuestion Input

```typescript
interface AskUserQuestionInput {
  questions: Array<{
    question: string;
    header?: string;
    options?: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
  }>;
}
```

### AskUserQuestion Output

```typescript
interface AskUserQuestionOutput {
  questions: Array<{...}>;
  answers: Record<string, string>; // multi-select = comma-separated
}
```

### DynamicToolUIPart (Relevant Fields)

```typescript
interface DynamicToolUIPart {
  type: "dynamic-tool";
  toolName: "AskUserQuestion";
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input: AskUserQuestionInput;
  output?: AskUserQuestionOutput;
}
```

### Approval File Location

```
{workdir}/.sandagent/approvals/{toolCallId}.json
```

### Approval File Format

```json
{
  "questions": [
    {
      "question": "What is your preferred language?",
      "header": "Preferences",
      "options": [
        { "label": "TypeScript", "description": "Type-safe JavaScript" },
        { "label": "Python", "description": "General-purpose" }
      ],
      "multiSelect": false
    }
  ],
  "answers": {
    "What is your preferred language?": "TypeScript"
  },
  "status": "pending" | "completed",
  "timestamp": "2025-01-30T12:00:00.000Z"
}
```

### `submitAnswer` Input

```typescript
await submitAnswer(sandbox, {
  toolCallId: string,
  questions: Question[],
  answers: Record<string, string>,
});
```

## Troubleshooting (Quick)

- **No progress**: verify both APIs use the same `workdir`.
- **UI not rendering**: ensure you handle `dynamic-tool` parts and `toolName === "AskUserQuestion"`.
- **Answers not applied**: confirm `answerEndpoint` matches your API route.

## Related Docs

- `docs/SDK_DEVELOPMENT_GUIDE.md`
- `docs/SDK_QUICK_START.md`
