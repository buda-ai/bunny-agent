/**
 * Universal SandAgent Runner
 *
 * Works with any sandagent runner: pi, claude, codex, gemini, opencode
 * All runners output AI SDK UI data stream format by default
 */

import { BaseRunner } from "./base.js";
import type { RunnerDefaults } from "./types.js";

export class SandAgentRunner extends BaseRunner {
  readonly name: string;
  readonly defaults: RunnerDefaults;

  constructor(runnerName: string) {
    super();
    this.name = runnerName;
    this.defaults = {
      command: "sandagent",
      args: ["run", "--runner", runnerName, "--"],
      timeout: 300000, // 5 minutes
    };
  }
}
