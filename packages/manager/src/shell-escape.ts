/**
 * Quote `value` as a single POSIX `sh` literal.
 *
 * Wrapping in single quotes makes everything inside literal — `$`,
 * backticks, `!`, newlines, and `"` all lose their special meaning. The only
 * character that still needs handling is a literal `'`, which cannot appear
 * inside a single-quoted string: each occurrence is closed out, an escaped
 * quote is inserted, then quoting resumes (`'\''`).
 *
 * Safe for building `export KEY=<value>` lines and argv strings sent to a
 * remote `sh -c`. Not a substitute for independent argv/env channels where
 * the sandbox transport supports them (preferred when available) — this is
 * the fallback for transports that only accept a single shell command
 * string. Sandock and E2B provide separate native env/cwd channels;
 * Daytona session commands require quoted shell exports.
 */
export function posixShellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
