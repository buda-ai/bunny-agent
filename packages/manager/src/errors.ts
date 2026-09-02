export const WORKSPACE_STORAGE_FULL_ERROR_CODE =
  "WORKSPACE_STORAGE_FULL" as const;
export const WORKSPACE_STORAGE_FULL_ERROR_TEXT = "Workspace storage is full.";

export type BunnyAgentErrorCode = typeof WORKSPACE_STORAGE_FULL_ERROR_CODE;

export interface BunnyAgentErrorPayload {
  errorText: string;
  errorCode?: BunnyAgentErrorCode;
}

interface ErrorLike {
  cause?: unknown;
  code?: unknown;
  errorCode?: unknown;
  errno?: unknown;
  message?: unknown;
}

const STORAGE_FULL_CODES = new Set([
  "EDQUOT",
  "ENOSPC",
  WORKSPACE_STORAGE_FULL_ERROR_CODE,
]);
const STORAGE_FULL_ERRNOS = new Set([-122, -28]);
const STORAGE_FULL_MESSAGE_PATTERNS = [
  /\bunknown system error -122\b/i,
  /\bdisk quota exceeded\b/i,
  /\bno space left on device\b/i,
];

function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === "object" && value !== null;
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isErrorLike(error) && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function isStorageFullError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (current !== undefined && current !== null && !visited.has(current)) {
    visited.add(current);

    if (isErrorLike(current)) {
      const code =
        typeof current.errorCode === "string"
          ? current.errorCode
          : current.code;
      if (
        typeof code === "string" &&
        STORAGE_FULL_CODES.has(code.toUpperCase())
      ) {
        return true;
      }
      const errno =
        typeof current.errno === "string" &&
        /^-?(?:28|122)$/.test(current.errno)
          ? Number(current.errno)
          : current.errno;
      if (typeof errno === "number" && STORAGE_FULL_ERRNOS.has(errno)) {
        return true;
      }
    }

    const message = getErrorText(current);
    if (
      STORAGE_FULL_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
    ) {
      return true;
    }

    current = isErrorLike(current) ? current.cause : undefined;
  }

  return false;
}

/** Convert runtime failures into the stable BunnyAgent wire error shape. */
export function normalizeBunnyAgentError(
  error: unknown,
): BunnyAgentErrorPayload {
  if (isStorageFullError(error)) {
    return {
      errorCode: WORKSPACE_STORAGE_FULL_ERROR_CODE,
      errorText: WORKSPACE_STORAGE_FULL_ERROR_TEXT,
    };
  }

  return { errorText: getErrorText(error) };
}
