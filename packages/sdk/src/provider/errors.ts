/** Error emitted by a BunnyAgent runner stream. */
export class BunnyAgentStreamError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "BunnyAgentStreamError";
    if (code !== undefined) this.code = code;
  }
}
