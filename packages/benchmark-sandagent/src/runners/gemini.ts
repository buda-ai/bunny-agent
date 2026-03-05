/**
 * SandAgent Gemini Runner
 *
 * Tests: sandagent run --runner gemini
 */

import { join } from "node:path";
import type { BenchmarkResult } from "@sandagent/benchmark-shared";
import { BaseRunner } from "./base.js";
import type { SmokingTask } from "../types.js";
import type { RunnerCommand } from "./types.js";

class SandAgentGeminiRunner extends BaseRunner {
  readonly name = "gemini";
  readonly defaults = {
    command: "node",
    args: [],
    timeout: 300000, // 5 minutes
  };

  buildCommand(task: SmokingTask): RunnerCommand {
    const projectRoot = process.env.PROJECT_ROOT;
    const localRunnerCli = projectRoot
      ? join(projectRoot, "apps/runner-cli/dist/bundle.mjs")
      : undefined;

    const command = localRunnerCli ? "node" : "sandagent";
    const args = localRunnerCli
      ? [localRunnerCli, "run", "--runner", "gemini", "--output-format", "stream-json", "--"]
      : ["run", "--runner", "gemini", "--output-format", "stream-json", "--"];

    return this.finalizeCommand(command, args, task);
  }

  extractAnswer(rawOutput: Required<BenchmarkResult["rawOutput"]>): string {
    return super.extractAnswer(rawOutput);
  }
}

export const geminiRunner = new SandAgentGeminiRunner();
