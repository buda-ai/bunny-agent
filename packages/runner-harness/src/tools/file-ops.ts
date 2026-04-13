import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
      properties: {
        path: {
          type: "string",
          description: "File path (relative to cwd or absolute)",
        },
      },
    },
    async execute(_id, params, _signal, _onUpdate) {
      const p = params as { path: string };
      const filePath = resolve(cwd, p.path);
      try {
        const content = readFileSync(filePath, "utf8");
        return {
          content: [{ type: "text", text: content }],
          details: undefined,
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          details: undefined,
        };
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
        path: {
          type: "string",
          description: "File path (relative to cwd or absolute)",
        },
        content: { type: "string", description: "Content to write" },
      },
    },
    async execute(_id, params, _signal, _onUpdate) {
      const p = params as { path: string; content: string };
      const filePath = resolve(cwd, p.path);
      const content = p.content;
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, content, "utf8");
        return {
          content: [{ type: "text", text: `Written: ${filePath}` }],
          details: undefined,
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          details: undefined,
        };
      }
    },
  };
}
