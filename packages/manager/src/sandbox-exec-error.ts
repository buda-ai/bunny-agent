/** Max bytes of captured stderr retained on a {@link SandboxExecError} (avoids unbounded diagnostics). */
const MAX_STDERR_BYTES = 4096;
const TRUNCATION_SUFFIX = "\n[truncated]";

/**
 * Deterministic sandbox exec failure classification.
 *
 * - `spawn_failed`: the executable could not be started at all (e.g. ENOENT,
 *   EACCES) — only reachable on adapters that spawn without an intermediate
 *   shell (e.g. {@link @bunny-agent/sandbox-local}).
 * - `shell_parse_error`: the generated shell string itself failed to parse
 *   (e.g. unclosed quote) before any user command could run.
 * - `nonzero_exit`: the command (or the wrapping shell) ran to completion
 *   and exited non-zero.
 * - `timeout`: {@link ExecOptions.timeout} elapsed before the command exited.
 * - `aborted`: {@link ExecOptions.signal} fired before the command exited.
 */
export type SandboxExecErrorCode =
  | "spawn_failed"
  | "shell_parse_error"
  | "nonzero_exit"
  | "timeout"
  | "aborted";

/** Truncate to a safe diagnostic size without ever logging more than the cap. */
function truncateStderr(stderr: string): string {
  if (Buffer.byteLength(stderr, "utf8") <= MAX_STDERR_BYTES) {
    return stderr;
  }
  return (
    utf8Prefix(
      stderr,
      MAX_STDERR_BYTES - Buffer.byteLength(TRUNCATION_SUFFIX),
    ) + TRUNCATION_SUFFIX
  );
}

function utf8Prefix(value: string, bytes: number): string {
  let result = "";
  let used = 0;
  for (const character of value) {
    used += Buffer.byteLength(character);
    if (used > bytes) break;
    result += character;
  }
  return result;
}

/** Bounded capture; partial secrets at the capture boundary are also redacted. */
export class ExecDiagnostics {
  private captured = "";
  private truncated = false;
  private readonly secrets: string[];

  constructor(env: Record<string, string | undefined> = {}) {
    this.secrets = Object.values(env)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => b.length - a.length);
  }

  append(chunk: string): void {
    const remaining = MAX_STDERR_BYTES - Buffer.byteLength(this.captured);
    const prefix = utf8Prefix(chunk, remaining);
    this.captured += prefix;
    if (prefix !== chunk) this.truncated = true;
  }

  redact(value: string): string {
    for (const secret of this.secrets)
      value = value.split(secret).join("[redacted]");
    return value;
  }

  text(): string {
    let value = this.redact(this.captured);
    if (this.truncated) {
      for (const secret of this.secrets) {
        for (
          let length = Math.min(secret.length - 1, value.length);
          length > 0;
          length--
        ) {
          if (value.endsWith(secret.slice(0, length))) {
            value = value.slice(0, -length) + "[redacted]";
            break;
          }
        }
      }
      value += TRUNCATION_SUFFIX;
    }
    return truncateStderr(value);
  }

  failure(error: unknown): SandboxExecError {
    return new SandboxExecError(
      truncateStderr(
        this.redact(error instanceof Error ? error.message : String(error)),
      ),
      {
        code: error instanceof SandboxExecError ? error.code : "nonzero_exit",
        exitCode: error instanceof SandboxExecError ? error.exitCode : null,
        signal: error instanceof SandboxExecError ? error.signal : undefined,
        stderr:
          error instanceof SandboxExecError && error.stderr
            ? truncateStderr(this.redact(error.stderr))
            : this.text(),
      },
    );
  }
}

/** Reject invalid inputs before any execution or shell interpolation. */
export function validateExecInput(
  command: string[],
  env: Record<string, string | undefined>,
): void {
  if (!command.length || !command[0]?.trim())
    throw new SandboxExecError("Command cannot be empty", {
      code: "spawn_failed",
    });
  for (const key of Object.keys(env)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))
      throw new SandboxExecError("Invalid environment variable key", {
        code: "spawn_failed",
      });
  }
}

/**
 * Structured error for deterministic sandbox exec startup failures (bad
 * command, shell syntax error, missing executable, nonzero exit).
 *
 * `retryable` is always `false`: replaying an execution after partial output
 * or a transport failure can duplicate side effects. This is a contract for
 * consumers, not an enforcement mechanism for external retry layers. Rethrown unmodified
 * by {@link streamCodingRunFromSandbox} and {@link BunnyAgent.stream}, so it
 * reaches SDK consumers intact instead of being replaced by an "unexpected
 * stream end" error.
 */
export class SandboxExecError extends Error {
  readonly code: SandboxExecErrorCode;
  readonly exitCode: number | null;
  readonly stderr?: string;
  readonly signal?: string | null;
  readonly retryable = false as const;

  constructor(
    message: string,
    options: {
      code: SandboxExecErrorCode;
      exitCode?: number | null;
      stderr?: string;
      cause?: unknown;
      signal?: string | null;
    },
  ) {
    super(
      message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "SandboxExecError";
    this.code = options.code;
    this.exitCode = options.exitCode ?? null;
    this.stderr =
      options.stderr != null ? truncateStderr(options.stderr) : undefined;
    this.signal = options.signal;
  }
}
