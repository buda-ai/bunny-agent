/**
 * Goal extension for runner-pi (headless port of pi-goal v2).
 *
 * Source: https://github.com/PurpleMyst/pi-goal
 *
 * Behaviour preserved from upstream:
 *   - State machine + session-entry persistence (via customType "pi-goal")
 *   - get_goal / update_goal tools, only active while goal.phase === "ready"
 *   - tool_call increments toolsUsed; agent_end loops continuationPrompt
 *   - turn_end + signal.aborted -> pause (no continuation after Ctrl-C)
 *   - NO_TOOL_CALLS guard: a turn that did nothing pauses the loop
 *   - setTimeout(0) deferral so pi.sendMessage attaches to the next turn
 *
 * Headless adaptations:
 *   - ctx.ui.notify(...)          → pi.sendMessage({ customType: "pi-goal-info" })
 *   - ctx.ui.confirm(...) override → always false (user must /goal clear first)
 *   - widget rendering             → dropped
 *
 * NOTE: enableGoal and enablePlanMode both drive triggerTurn loops out of
 * agent_end. They aren't designed to coexist - pick one per session.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { CUSTOM_TYPE, goalForSession } from "./goal-finder.js";
import { GoalStateMachine, NO_TOOL_CALLS } from "./state-machine.js";

const GOAL_TOOLS = ["get_goal", "update_goal"];
const INFO_CUSTOM_TYPE = "pi-goal-info";

function notify(
  pi: ExtensionAPI,
  content: string,
  level: "info" | "warning" = "info",
): void {
  pi.sendMessage(
    {
      customType: INFO_CUSTOM_TYPE,
      content: level === "warning" ? `[goal/warning] ${content}` : content,
      display: true,
    },
    { triggerTurn: false },
  );
}

export default function goalExtension(pi: ExtensionAPI): void {
  pi.registerCommand("goal", {
    description:
      "Set, pause, resume, clear, or inspect a continuous goal that the agent loops on until update_goal completes it.",
    async handler(args, ctx) {
      const trimmed = args.trim();
      const gm = new GoalStateMachine(goalForSession(ctx.sessionManager));
      let prompt: string | undefined;

      if (trimmed.length === 0) {
        notify(pi, `Goal state: ${JSON.stringify(gm.state)}`);
        return;
      }

      const lower = trimmed.toLowerCase();
      if (lower === "pause") {
        if (gm.state.phase !== "ready") {
          notify(pi, "No active goal to pause.", "warning");
          return;
        }
        gm.pause();
      } else if (lower === "resume") {
        if (gm.state.phase !== "paused") {
          notify(pi, "No paused goal to resume.", "warning");
          return;
        }
        prompt = gm.resume();
      } else if (lower === "clear") {
        gm.clear();
        notify(pi, "Goal cleared.");
      } else {
        try {
          prompt = await gm.start(trimmed, () => false);
        } catch {
          notify(
            pi,
            "A goal is already active. Run /goal clear before setting a new one.",
            "warning",
          );
          return;
        }
      }

      if (prompt !== undefined) {
        sendGoalMessage(pi, ctx, prompt, gm);
      } else {
        pi.appendEntry(CUSTOM_TYPE, gm.state);
        syncPiState(pi, gm);
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const gm = new GoalStateMachine(goalForSession(ctx.sessionManager));
    syncPiState(pi, gm);
  });

  pi.on("tool_call", async (_event, ctx) => {
    const gm = new GoalStateMachine(goalForSession(ctx.sessionManager));
    if (gm.registerToolCall()) {
      pi.appendEntry(CUSTOM_TYPE, gm.state);
      syncPiState(pi, gm);
    }
  });

  // signal.aborted is only meaningful inside turn-related events.
  pi.on("turn_end", async (_event, ctx) => {
    if (!ctx.signal?.aborted) return;
    const gm = new GoalStateMachine(goalForSession(ctx.sessionManager));
    if (gm.state.phase !== "ready") return;
    notify(
      pi,
      "Agent aborted; goal paused. Use /goal resume to continue.",
      "warning",
    );
    gm.pause();
    pi.appendEntry(CUSTOM_TYPE, gm.state);
    syncPiState(pi, gm);
  });

  pi.on("agent_end", async (_event, ctx) => {
    const gm = new GoalStateMachine(goalForSession(ctx.sessionManager));
    const next = gm.continue();
    if (next === undefined) return;
    if (next === NO_TOOL_CALLS) {
      notify(
        pi,
        "Previous iteration made no tool calls. Goal paused for safety.",
        "warning",
      );
      gm.pause();
      pi.appendEntry(CUSTOM_TYPE, gm.state);
      syncPiState(pi, gm);
      return;
    }
    sendGoalMessage(pi, ctx, next, gm);
  });

  pi.registerTool({
    name: "get_goal",
    label: "Get Current Goal",
    description:
      "Get the current active goal objective and status. Returns 'No active goal.' if none is set.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const gm = new GoalStateMachine(goalForSession(ctx.sessionManager));
      if (gm.state.phase === "idle") {
        return {
          content: [{ type: "text", text: "No active goal." }],
          details: {},
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Objective: ${gm.state.objective}\nStatus: ${gm.state.phase}`,
          },
        ],
        details: { objective: gm.state.objective, phase: gm.state.phase },
      };
    },
  });

  pi.registerTool({
    name: "update_goal",
    label: "Update Goal Status",
    description:
      'Update the status of the current goal. Call with status "complete" when the goal is achieved. Do not mark a goal complete merely because you are stopping work or the budget is running out — only mark it complete when the objective has actually been achieved and no required work remains.',
    parameters: Type.Object({
      status: Type.Literal("complete"),
    }),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const gm = new GoalStateMachine(goalForSession(ctx.sessionManager));
      if (gm.state.phase !== "ready") {
        return {
          content: [
            {
              type: "text",
              text: "No active goal to complete.",
            },
          ],
          details: {},
        };
      }
      gm.complete();
      pi.appendEntry(CUSTOM_TYPE, gm.state);
      syncPiState(pi, gm);
      return {
        content: [{ type: "text", text: "Goal marked complete." }],
        details: {},
      };
    },
  });
}

/**
 * Add or remove the goal tools from the active set based on phase.
 * Idempotent — safe to call from any handler that just mutated state.
 */
function syncPiState(pi: ExtensionAPI, gm: GoalStateMachine): void {
  const active = pi.getActiveTools();
  if (gm.state.phase === "ready") {
    const missing = GOAL_TOOLS.filter((name) => !active.includes(name));
    if (missing.length > 0) pi.setActiveTools([...active, ...missing]);
  } else {
    const filtered = active.filter((name) => !GOAL_TOOLS.includes(name));
    if (filtered.length !== active.length) pi.setActiveTools(filtered);
  }
}

/**
 * Mirrors pi-goal v2's setTimeout(0) deferral: queue the trigger so the
 * current turn finishes processing before the new turn opens. If the
 * runtime is not idle (or has pending messages) when the timer fires, we
 * pause the goal instead of stomping the in-flight conversation.
 */
function sendGoalMessage(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  prompt: string,
  gm: GoalStateMachine,
): void {
  gm.resetToolCalls();
  syncPiState(pi, gm);

  setTimeout(() => {
    if (ctx.hasPendingMessages() || !ctx.isIdle()) {
      gm.pause();
      syncPiState(pi, gm);
      pi.appendEntry(CUSTOM_TYPE, gm.state);
      return;
    }
    pi.sendMessage(
      {
        customType: CUSTOM_TYPE,
        content: prompt,
        display: true,
        details: gm.state,
      },
      { triggerTurn: true },
    );
  }, 0);
}
