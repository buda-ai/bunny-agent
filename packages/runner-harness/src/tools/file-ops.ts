import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ToolDefinition } from "./types.js";

export function buildReadFileTool(cwd: string): ToolDefinition {
  return {
    name: "read_file",
    label: "read file",
    description: "Read the contents of a file.",
    promptSnippet: "read_file(path)",
    promptGuidelines: ["Use to read source code, configs, or any text file."],
    parameters: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string", description: "File path (relative to cwd or absolute)" } },
    },
    async execute(_id, params, _signal, _onUpdate) {
      const p = params as Record<string, unknown>;
      const filePath = resolve(cwd, p.path as string);
      try {
        const content = readFileSync(filePath, "utf8");
        return { content: [{ type: "text" as const, text: content }], details: undefined };
      } catch (e: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], details: undefined };
      }
    },
  };
}

export function buildWriteFileTool(cwd: string): ToolDefinition {
  return {
    name: "write_file",
    label: "write file",
    description: "Write content to a file, creating directories as needed.",
    promptSnippet: "write_file(path, content)",
    promptGuidelines: ["Use to create or overwrite files."],
    parameters: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string", description: "File path (relative to cwd or absolute)" },
        content: { type: "string", description: "Content to write" },
      },
    },
    async execute(_id, params, _signal, _onUpdate) {
      const p = params as Record<string, unknown>;
      const filePath = resolve(cwd, p.path as string);
      const content = p.content as string;
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, content, "utf8");
        return { content: [{ type: "text" as const, text: `Written: ${filePath}` }], details: undefined };
      } catch (e: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], details: undefined };
      }
    },
  };
}
