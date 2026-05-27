import { continuationPrompt } from "./prompts.js";
import type { GoalState } from "./state.js";

export const NO_TOOL_CALLS = Symbol("NO_TOOL_CALLS");

/**
 * Goal lifecycle:
 *   idle → start(objective) → ready
 *   ready → registerToolCall() (per tool call, increments toolsUsed)
 *   ready → continue() → continuationPrompt | NO_TOOL_CALLS
 *   ready → pause() → paused
 *   paused → resume() → ready
 *   ready → complete() → idle
 *   any → clear() → idle
 */
export class GoalStateMachine {
  constructor(public state: GoalState) {}

  /**
   * Start a new goal. Manager must be idle, or paused with an explicit override.
   * Returns the continuation prompt to send to the agent on success.
   */
  async start(
    objective: string,
    confirmIfPaused: () => Promise<boolean> | boolean,
  ): Promise<string> {
    if (this.state.phase !== "idle") {
      const overridePaused =
        this.state.phase === "paused" && (await confirmIfPaused());
      if (!overridePaused) {
        throw new Error("Cannot set objective while not idle");
      }
    }
    this.state = { phase: "ready", objective, startedAt: Date.now() };
    return continuationPrompt(objective);
  }

  resume(): string {
    if (this.state.phase !== "paused") {
      throw new Error("Cannot resume goal while not paused");
    }
    const objective = this.state.objective;
    this.state = { phase: "ready", objective, startedAt: Date.now() };
    return continuationPrompt(objective);
  }

  /**
   * Decide whether the agent should keep looping after agent_end.
   * Returns the next prompt, NO_TOOL_CALLS if the previous turn was a no-op,
   * or undefined if no continuation is needed.
   */
  continue(): string | typeof NO_TOOL_CALLS | undefined {
    if (this.state.phase !== "ready") return undefined;
    if (!this.state.toolsUsed) return NO_TOOL_CALLS;
    return continuationPrompt(this.state.objective);
  }

  abort(): boolean {
    if (this.state.phase !== "ready") return false;
    this.pause();
    return true;
  }

  pause(): void {
    if (this.state.phase !== "ready") {
      throw new Error("Cannot pause goal while not ready");
    }
    this.state = { phase: "paused", objective: this.state.objective };
  }

  complete(): void {
    if (this.state.phase !== "ready") {
      throw new Error("Cannot complete goal while not ready");
    }
    this.clear();
  }

  clear(): void {
    this.state = { phase: "idle" };
  }

  resetToolCalls(): void {
    if (this.state.phase !== "ready") return;
    this.state.toolsUsed = 0;
  }

  registerToolCall(): boolean {
    if (this.state.phase !== "ready") return false;
    this.state.toolsUsed = (this.state.toolsUsed ?? 0) + 1;
    return true;
  }
}
