import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import goalExtension from "./goal/index.js";
import planModeExtension from "./plan-mode/index.js";
import safetyExtension from "./safety.js";
import subagentExtension from "./subagent/index.js";

export interface BunnyPiExtensionOptions {
  permissionMode?: "safe" | "yolo";
}

function workflowPrompt(workflow: string, task: string): string {
  const trimmedTask = task.trim() || "the user's current request";

  switch (workflow) {
    case "implement":
      return `Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "scout" agent to find all code relevant to: ${trimmedTask}
2. Then, use the "planner" agent to create an implementation plan for "${trimmedTask}" using the context from the previous step. Use the {previous} placeholder.
3. Finally, use the "worker" agent to implement the plan from the previous step. Use the {previous} placeholder.

Execute this as a chain, passing output between steps via {previous}.`;
    case "implement-and-review":
      return `Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "worker" agent to implement: ${trimmedTask}
2. Then, use the "reviewer" agent to review the implementation from the previous step. Use the {previous} placeholder.
3. Finally, use the "worker" agent to apply the feedback from the review. Use the {previous} placeholder.

Execute this as a chain, passing output between steps via {previous}.`;
    case "scout-and-plan":
      return `Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "scout" agent to find all code relevant to: ${trimmedTask}
2. Then, use the "planner" agent to create an implementation plan for "${trimmedTask}" using the context from the previous step. Use the {previous} placeholder.

Execute this as a chain, passing output between steps via {previous}. Do NOT implement. Return only the plan.`;
    default:
      return trimmedTask;
  }
}

function registerWorkflowCommand(
  pi: ExtensionAPI,
  name: "implement" | "implement-and-review" | "scout-and-plan",
  description: string,
): void {
  pi.registerCommand(name, {
    description,
    handler: async (args) => {
      pi.sendUserMessage(workflowPrompt(name, args));
    },
  });
}

export function createBunnyPiExtension(
  options: BunnyPiExtensionOptions = {},
): (pi: ExtensionAPI) => void {
  return (pi: ExtensionAPI) => bunnyPiExtension(pi, options);
}

export function bunnyPiExtension(
  pi: ExtensionAPI,
  options: BunnyPiExtensionOptions = {},
): void {
  safetyExtension(pi, { defaultPermissionMode: options.permissionMode });
  goalExtension(pi);
  planModeExtension(pi);
  subagentExtension(pi);

  registerWorkflowCommand(
    pi,
    "implement",
    "Scout, plan, and implement with bundled subagents",
  );
  registerWorkflowCommand(
    pi,
    "implement-and-review",
    "Implement, review, and apply feedback with bundled subagents",
  );
  registerWorkflowCommand(
    pi,
    "scout-and-plan",
    "Scout code context and create a plan without implementation",
  );

  pi.registerCommand("subagent", {
    description: "Show available bundled subagents",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        [
          "Bundled subagents: scout, planner, reviewer, worker.",
          "Use the subagent tool directly, or prompt with /implement, /implement-and-review, or /scout-and-plan.",
        ].join("\n"),
        "info",
      );
    },
  });
}

export default bunnyPiExtension;
