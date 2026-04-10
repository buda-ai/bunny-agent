import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { basename } from "node:path";
import { execFile } from "node:child_process";
import { t } from "./theme.js";

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function getGitBranch(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
      { timeout: 1000 },
      (err, stdout) => resolve(err ? null : stdout.trim() || null),
    );
  });
}

export class Footer implements Component {
  private inputTokens = 0;
  private outputTokens = 0;
  private sessionId: string | undefined;
  private branch: string | null = null;

  constructor(
    public runner: string,
    public model: string,
    private cwd: string,
  ) {
    // Async branch fetch — updates on next render
    getGitBranch(cwd).then((b) => { this.branch = b; });
  }

  addUsage(input: number, output: number) {
    this.inputTokens += input;
    this.outputTokens += output;
  }

  setSessionId(id: string | undefined) { this.sessionId = id; }

  render(width: number): string[] {
    // Left: cwd + git branch
    let left = basename(this.cwd) || this.cwd;
    if (this.branch) left += t.dim(` (${this.branch})`);
    const leftStr = t.dim(left);

    // Right: runner · model · tokens · session
    const parts: string[] = [t.accent(this.runner), t.dim(this.model)];
    if (this.inputTokens || this.outputTokens)
      parts.push(t.dim(`↑${formatTokens(this.inputTokens)} ↓${formatTokens(this.outputTokens)}`));
    if (this.sessionId)
      parts.push(t.dim(`#${this.sessionId.slice(0, 8)}`));
    const right = parts.join(t.dim(" · "));

    const lw = visibleWidth(leftStr);
    const rw = visibleWidth(right);
    const gap = width - lw - rw;
    const line = gap >= 1
      ? leftStr + " ".repeat(gap) + right
      : truncateToWidth(leftStr, width - rw - 1, "…") + " " + right;

    return [t.separator(width), line];
  }

  invalidate() {}
}
