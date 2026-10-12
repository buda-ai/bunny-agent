import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { posixShellQuote } from "../shell-escape.js";

const execFileAsync = promisify(execFile);

/** Run `sh -c <script>` for real and return trimmed stdout. */
async function runShell(script: string): Promise<string> {
  const { stdout } = await execFileAsync("/bin/sh", ["-c", script]);
  return stdout;
}

describe("posixShellQuote", () => {
  it("round-trips a plain value through a real shell", async () => {
    const value = "hello";
    const out = await runShell(`printf '%s' ${posixShellQuote(value)}`);
    expect(out).toBe(value);
  });

  it("round-trips a value containing a single quote", async () => {
    const value = "it's a test";
    const out = await runShell(`printf '%s' ${posixShellQuote(value)}`);
    expect(out).toBe(value);
  });

  it("neutralizes command substitution via backticks", async () => {
    const value = "`touch /tmp/pwned-backtick-$$`";
    const out = await runShell(`printf '%s' ${posixShellQuote(value)}`);
    expect(out).toBe(value);
  });

  it("neutralizes command substitution via $()", async () => {
    const value = "$(touch /tmp/pwned-dollar-$$)";
    const out = await runShell(`printf '%s' ${posixShellQuote(value)}`);
    expect(out).toBe(value);
  });

  it("neutralizes variable expansion", async () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional shell `${PATH}` literal, not an accidental JS template placeholder
    const value = "$HOME and $PATH and ${PATH}";
    const out = await runShell(`printf '%s' ${posixShellQuote(value)}`);
    expect(out).toBe(value);
  });

  it("preserves embedded newlines literally", async () => {
    const value = "line one\nline two\nline three";
    const out = await runShell(`printf '%s' ${posixShellQuote(value)}`);
    expect(out).toBe(value);
  });

  it("neutralizes history-expansion-looking content (no special meaning in sh -c)", async () => {
    const value = "echo !!; rm -rf /tmp/should-not-run-$$";
    const out = await runShell(`printf '%s' ${posixShellQuote(value)}`);
    expect(out).toBe(value);
  });

  it("neutralizes a trailing unescaped double quote", async () => {
    const value = 'say "hello" to "world"';
    const out = await runShell(`printf '%s' ${posixShellQuote(value)}`);
    expect(out).toBe(value);
  });

  it("neutralizes semicolons and pipes used as command separators", async () => {
    const value = "; touch /tmp/pwned-semi-$$ | true";
    const out = await runShell(`printf '%s' ${posixShellQuote(value)}`);
    expect(out).toBe(value);
  });

  it("supports the export KEY=value pattern used by remote adapters", async () => {
    const key = "MY_SECRET";
    const value = "value with `backticks`, $vars, and 'quotes'";
    const script = `export ${key}=${posixShellQuote(value)} && printf '%s' "$${key}"`;
    const out = await runShell(script);
    expect(out).toBe(value);
  });

  it("does not actually execute injected shell syntax (negative control)", async () => {
    const marker = `pwn-marker-${process.pid}-${Date.now()}`;
    const value = `\`echo ${marker} > /tmp/${marker}.txt\``;
    await runShell(`printf '%s' ${posixShellQuote(value)} > /dev/null`);
    await expect(
      execFileAsync("/bin/sh", ["-c", `test -f /tmp/${marker}.txt`]),
    ).rejects.toBeTruthy();
  });

  it("handles the empty string", async () => {
    const out = await runShell(`printf '%s' ${posixShellQuote("")}`);
    expect(out).toBe("");
  });
});
