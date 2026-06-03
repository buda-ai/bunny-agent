import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import goalExtension from "./goal/index.js";
import planModeExtension from "./plan-mode/index.js";
import safetyExtension from "./safety.js";
import subagentExtension from "./subagent/index.js";

const BUNDLED_EXTENSIONS_DIR = dirname(fileURLToPath(import.meta.url));

export interface BunnyPiExtensionOptions {
  permissionMode?: "safe" | "yolo";
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

  pi.on("resources_discover", () => ({
    promptPaths: [
      join(BUNDLED_EXTENSIONS_DIR, "subagent", "prompts", "implement.md"),
      join(
        BUNDLED_EXTENSIONS_DIR,
        "subagent",
        "prompts",
        "implement-and-review.md",
      ),
      join(BUNDLED_EXTENSIONS_DIR, "subagent", "prompts", "scout-and-plan.md"),
    ],
  }));

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
