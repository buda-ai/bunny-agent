/**
 * Plan-mode extension for runner-pi (headless variant).
 *
 * Adapted from pi-mono/coding-agent/examples/extensions/plan-mode/.
 * Differences vs upstream:
 *   - No ui.notify / ui.setStatus / ui.setWidget / ui.editor / ui.select calls
 *     (no TUI in Bunny's stream pipeline). Status is communicated via custom
 *     messages so the host can render them.
 *   - No keyboard shortcut registration (no key stream available headless).
 *   - Plan -> execution transition is driven by ask_user_question (the host's
 *     equivalent of pi-mono's "select Execute"): the LLM is instructed to end
 *     a finished plan with an Execute/Refine question; an "Execute" answer is
 *     intercepted in tool_result, the transition runs in agent_end, and a
 *     fresh user message with triggerTurn:true opens a new turn so the
 *     execution prompt and tool whitelist are re-applied. /plan stays as a
 *     manual fallback.
 *   - Bash safety filter, [DONE:n] tracking, setActiveTools whitelist, and
 *     session persistence are kept verbatim.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  extractTodoItems,
  isSafeCommand,
  markCompletedSteps,
  type TodoItem,
} from "./utils.js";

const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "ask_user_question"];
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"];

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
  return m.role === "assistant" && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export default function planModeExtension(pi: ExtensionAPI): void {
  let planModeEnabled = false;
  let executionMode = false;
  let todoItems: TodoItem[] = [];
  // Set when the LLM's ask_user_question receives an "Execute" answer.
  // Consumed in agent_end to transition out of plan mode and trigger a fresh
  // execution turn (so before_agent_start can re-inject the execution prompt
  // and tool whitelist for the new run).
  let pendingExecuteRequest = false;

  pi.registerFlag("plan", {
    description: "Start in plan mode (read-only exploration)",
    type: "boolean",
    default: false,
  });

  function persistState(): void {
    pi.appendEntry("plan-mode", {
      enabled: planModeEnabled,
      todos: todoItems,
      executing: executionMode,
    });
  }

  function enterPlanMode(): void {
    planModeEnabled = true;
    executionMode = false;
    todoItems = [];
    pendingExecuteRequest = false;
    pi.setActiveTools(PLAN_MODE_TOOLS);
  }

  // Headless transition: leaving plan mode while todos exist auto-enters execution mode.
  function leavePlanMode(): void {
    planModeEnabled = false;
    if (todoItems.length > 0 && !todoItems.every((t) => t.completed)) {
      executionMode = true;
    }
    pi.setActiveTools(NORMAL_MODE_TOOLS);
  }

  pi.registerCommand("plan", {
    description:
      "Toggle plan mode (read-only exploration). Leaving plan mode with extracted todos enters execution mode.",
    handler: async () => {
      if (planModeEnabled) {
        leavePlanMode();
      } else {
        enterPlanMode();
      }
      persistState();
    },
  });

  // Block destructive bash commands while plan mode is active.
  pi.on("tool_call", async (event) => {
    if (!planModeEnabled || event.toolName !== "bash") return;
    const command =
      (event.input as { command?: string } | undefined)?.command ?? "";
    if (!isSafeCommand(command)) {
      return {
        block: true,
        reason: `Plan mode: command blocked (not allowlisted). Disable plan mode first.\nCommand: ${command}`,
      };
    }
  });

  // Watch ask_user_question results: an "Execute" answer queues the
  // plan -> execution transition. We don't switch immediately because we're
  // still mid-run with the [PLAN MODE ACTIVE] system prompt; the actual
  // transition happens in agent_end so before_agent_start can re-inject the
  // execution context for the new turn.
  pi.on("tool_result", async (event) => {
    if (!planModeEnabled) return;
    if (event.toolName !== "ask_user_question") return;
    const text = (event.content ?? [])
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    // formatAcceptedText emits lines like "A: Execute the plan".
    if (/^A:.*\bExecute\b/im.test(text)) {
      pendingExecuteRequest = true;
    }
  });

  // Drop stale plan-mode context messages when plan mode is off.
  pi.on("context", async (event) => {
    if (planModeEnabled) return;
    return {
      messages: event.messages.filter((m) => {
        const msg = m as AgentMessage & { customType?: string };
        if (msg.customType === "plan-mode-context") return false;
        if (msg.role !== "user") return true;

        const content = msg.content;
        if (typeof content === "string") {
          return !content.includes("[PLAN MODE ACTIVE]");
        }
        if (Array.isArray(content)) {
          return !content.some(
            (c) =>
              c.type === "text" &&
              (c as TextContent).text?.includes("[PLAN MODE ACTIVE]"),
          );
        }
        return true;
      }),
    };
  });

  // Inject the plan/execution prompt before each agent turn.
  pi.on("before_agent_start", async () => {
    if (planModeEnabled) {
      return {
        message: {
          customType: "plan-mode-context",
          content: `[PLAN MODE ACTIVE]
You are in plan mode - a read-only exploration mode for safe code analysis.

Restrictions:
- You can only use: read, bash, grep, find, ls, ask_user_question
- You CANNOT use: edit, write (file modifications are disabled)
- Bash is restricted to an allowlist of read-only commands

If the request is ambiguous, call ask_user_question to clarify before
producing the plan - do not guess.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

After the plan is ready, call ask_user_question once with this exact
shape so the user can decide whether to execute it:
  question: "Plan ready. What next?"
  header:   "Plan"
  options:  [
    { label: "Execute the plan", description: "Switch to execution mode and start now." },
    { label: "Refine",           description: "Keep iterating on the plan first." },
  ]
Picking "Execute the plan" leaves plan mode and starts the run
automatically. Picking "Refine" keeps you in plan mode.

Do NOT attempt to make changes - just describe what you would do.`,
          display: false,
        },
      };
    }

    if (executionMode && todoItems.length > 0) {
      const remaining = todoItems.filter((t) => !t.completed);
      const todoList = remaining
        .map((t) => `${t.step}. ${t.text}`)
        .join("\n");
      return {
        message: {
          customType: "plan-execution-context",
          content: `[EXECUTING PLAN - Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.
After completing a step, include a [DONE:n] tag in your response.`,
          display: false,
        },
      };
    }
  });

  pi.on("turn_end", async (event) => {
    if (!executionMode || todoItems.length === 0) return;
    if (!isAssistantMessage(event.message)) return;
    const text = getTextContent(event.message);
    if (markCompletedSteps(text, todoItems) > 0) {
      persistState();
    }
  });

  pi.on("agent_end", async (event) => {
    // Execution mode: emit completion summary once all todos are done.
    if (executionMode && todoItems.length > 0) {
      if (todoItems.every((t) => t.completed)) {
        const completedList = todoItems
          .map((t) => `~~${t.text}~~`)
          .join("\n");
        pi.sendMessage(
          {
            customType: "plan-complete",
            content: `**Plan Complete!**\n\n${completedList}`,
            display: true,
          },
          { triggerTurn: false },
        );
        executionMode = false;
        todoItems = [];
        pi.setActiveTools(NORMAL_MODE_TOOLS);
        persistState();
      }
      return;
    }

    if (!planModeEnabled) return;

    // Plan-mode end of turn: extract numbered plan from the last assistant message.
    const lastAssistant = [...event.messages]
      .reverse()
      .find(isAssistantMessage);
    if (lastAssistant) {
      const extracted = extractTodoItems(getTextContent(lastAssistant));
      if (extracted.length > 0) {
        todoItems = extracted;
      }
    }

    // ask_user_question -> "Execute" answered during this run: transition
    // automatically. We open a fresh turn so before_agent_start can inject
    // the [EXECUTING PLAN] context with the right tool whitelist.
    if (pendingExecuteRequest && todoItems.length > 0) {
      pendingExecuteRequest = false;
      leavePlanMode();
      pi.sendMessage(
        {
          customType: "plan-mode-execute",
          content: `Execute the plan. Start with: ${todoItems[0].text}`,
          display: true,
        },
        { triggerTurn: true },
      );
      persistState();
      return;
    }
    pendingExecuteRequest = false;

    if (todoItems.length > 0) {
      const todoListText = todoItems
        .map((t, i) => `${i + 1}. ☐ ${t.text}`)
        .join("\n");
      pi.sendMessage(
        {
          customType: "plan-todo-list",
          content: `**Plan ready (${todoItems.length} steps)**

${todoListText}

---
Plan mode is **read-only** — edit/write are disabled.
- Run \`/plan\` to leave plan mode and start executing the plan.
- Or send another message to refine the plan first.`,
          display: true,
        },
        { triggerTurn: false },
      );
    }
    persistState();
  });

  // Restore state on session start/resume.
  pi.on("session_start", async (_event, ctx) => {
    if (pi.getFlag("plan") === true) {
      planModeEnabled = true;
    }

    const entries = ctx.sessionManager.getEntries();
    const planModeEntry = entries
      .filter(
        (e: { type: string; customType?: string }) =>
          e.type === "custom" && e.customType === "plan-mode",
      )
      .pop() as
      | {
          data?: { enabled: boolean; todos?: TodoItem[]; executing?: boolean };
        }
      | undefined;

    if (planModeEntry?.data) {
      planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
      todoItems = planModeEntry.data.todos ?? todoItems;
      executionMode = planModeEntry.data.executing ?? executionMode;
    }

    const isResume = planModeEntry !== undefined;
    if (isResume && executionMode && todoItems.length > 0) {
      let executeIndex = -1;
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i] as { type: string; customType?: string };
        if (entry.customType === "plan-mode-execute") {
          executeIndex = i;
          break;
        }
      }
      const messages: AssistantMessage[] = [];
      for (let i = executeIndex + 1; i < entries.length; i++) {
        const entry = entries[i];
        if (
          entry.type === "message" &&
          "message" in entry &&
          isAssistantMessage(entry.message as AgentMessage)
        ) {
          messages.push(entry.message as AssistantMessage);
        }
      }
      const allText = messages.map(getTextContent).join("\n");
      markCompletedSteps(allText, todoItems);
    }

    if (planModeEnabled) {
      pi.setActiveTools(PLAN_MODE_TOOLS);
    }
  });
}
