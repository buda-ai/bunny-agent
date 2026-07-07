/**
 * Claude has no user-visible session file we own (Anthropic SDK owns the
 * session state internally), so there's nothing to fork on our side.
 * Callers should fall back to sending the prior conversation as an
 * initial prompt.
 */

export class RunnerForkUnsupportedError extends Error {
  constructor() {
    super("Session fork is not supported for runner: claude");
    this.name = "RunnerForkUnsupportedError";
  }
}

export function forkClaudeSession(): never {
  throw new RunnerForkUnsupportedError();
}
