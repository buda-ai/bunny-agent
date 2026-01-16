/**
 * OpenCode Runner
 *
 * Handles OpenCode CLI (open-source AI coding agent)
 * https://github.com/opencode-ai/opencode
 */

import { BaseRunner } from "./base.js";

class OpenCodeRunner extends BaseRunner {
  readonly name = "opencode";
  readonly defaults = {
    command: "opencode",
    args: ["run"],
    timeout: 300000, // 5 minutes
  };
}

export const opencodeRunner = new OpenCodeRunner();
