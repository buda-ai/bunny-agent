/**
 * Format unknown thrown values for logs and Error.message.
 * Avoids "[object Object]" when callers throw plain objects or Errors with empty messages.
 */
function errorRecord(err: Error): Record<string, unknown> {
  const isObjectToStringMessage = /^\[object [^\]]+\]$/.test(
    err.message.trim(),
  );

  const extra: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(err)) {
    if (key === "name" || key === "message" || key === "stack") continue;
    extra[key] = (err as unknown as Record<string, unknown>)[key];
  }
  // Some SDKs expose diagnostics on inherited properties.
  for (const key of ["code", "status", "response", "body", "data"]) {
    if (key in (err as unknown as Record<string, unknown>) && !(key in extra)) {
      extra[key] = (err as unknown as Record<string, unknown>)[key];
    }
  }

  return {
    name: err.name,
    message: err.message,
    ...(isObjectToStringMessage
      ? {
          note: "Upstream error message was stringified object",
        }
      : {}),
    ...(err.cause !== undefined
      ? { cause: formatUnknownError(err.cause) }
      : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
}

export function formatUnknownError(err: unknown): string {
  if (err == null) return String(err);
  if (typeof err === "string") return err;
  if (typeof err === "number" || typeof err === "boolean") return String(err);
  if (err instanceof Error) {
    try {
      return JSON.stringify(errorRecord(err));
    } catch {
      const message = err.message?.trim() ?? "";
      return `${err.name}: ${message || "(no message)"}`;
    }
  }
  if (typeof err === "object") {
    try {
      return JSON.stringify(err, (_key, value) => {
        if (value instanceof Error) return errorRecord(value);
        return value;
      });
    } catch {
      return "Unserializable object error";
    }
  }
  return String(err);
}

/**
 * Normalize any thrown value into a real `Error` instance.
 * If `err` is already an Error, return it as-is (preserves stack and identity).
 * Otherwise wraps the value via {@link formatUnknownError} and keeps the
 * original payload as `cause` so context is not lost.
 */
export function ensureError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(formatUnknownError(err), { cause: err });
}

/**
 * Build a verbose, log-friendly description of a value.
 * On top of {@link formatUnknownError}, surfaces any extra own properties an
 * Error carries (e.g. `status`, `code`, `body`, `response`) plus its `cause`
 * — useful when an upstream SDK produced an Error whose `.message` is useless
 * (e.g. literal `"[object Object]"`) but the real diagnostic info is attached
 * as side fields.
 */
export function describeError(err: unknown): string {
  const summary = formatUnknownError(err);
  if (!(err instanceof Error)) return summary;

  const extra: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(err)) {
    if (key === "stack" || key === "message" || key === "name") continue;
    extra[key] = (err as unknown as Record<string, unknown>)[key];
  }
  if (err.cause !== undefined) extra.cause = err.cause;

  if (Object.keys(extra).length === 0) return summary;
  try {
    return `${summary} | extra=${JSON.stringify(extra)}`;
  } catch {
    return summary;
  }
}
