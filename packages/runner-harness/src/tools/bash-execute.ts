import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDefinition } from "./types.js";

const execFileAsync = promisify(execFile);

export function buildBashTool(cwd: string): ToolDefinition {
  return {
    name: "bash",
    label: "bash",
    description: "Execute a bash command and return stdout/stderr.",
    promptSnippet: "bash(command, timeout_ms?)",
    promptGuidelines: [
      "Use for running shell commands, scripts, or system operations.",
      "Prefer specific commands over broad ones.",
    ],
    parameters: {
      type: "object",
      required: ["command"],
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        timeout_ms: { type: "number", description: "Timeout in ms (default 30000)" },
      },
    },
    async execute(_id, params, signal, _onUpdate) {
      const p = params as Record<string, unknown>;
      const command = p.command as string;
      const timeout = (p.timeout_ms as number) ?? 30_000;
      try {
        const { stdout, stderr } = await execFileAsync("bash", ["-c", command], {
          cwd,
          timeout,
          signal: signal ?? undefined,
          maxBuffer: 1024 * 1024,
        });
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        return { content: [{ type: "text" as const, text: out || "(no output)" }], details: undefined };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], details: undefined };
      }
    },
  };
}
