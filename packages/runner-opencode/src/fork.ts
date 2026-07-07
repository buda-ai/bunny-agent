/**
 * OpenCode does not expose a fork/clone primitive, so callers must fall
 * back to sending the prior conversation as an initial prompt.
 */

export class RunnerForkUnsupportedError extends Error {
  constructor() {
    super("Session fork is not supported for runner: opencode");
    this.name = "RunnerForkUnsupportedError";
  }
}

export function forkOpenCodeSession(): never {
  throw new RunnerForkUnsupportedError();
}
