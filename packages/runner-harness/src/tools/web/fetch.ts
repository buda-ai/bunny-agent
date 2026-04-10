import type { ToolDefinition } from "../types.js";
import { fetchPageContent } from "./search.js";

export function buildWebFetchTool(): ToolDefinition {
  return {
    name: "web_fetch",
    label: "web fetch",
    description: "Fetch a web page and extract its readable text content.",
    promptSnippet: "web_fetch(url)",
    promptGuidelines: ["Use when you already have a URL and need its content."],
    parameters: {
      type: "object",
      required: ["url"],
      properties: { url: { type: "string" } },
    },
    async execute(_id, params, _signal, _onUpdate) {
      const url = (params as Record<string, unknown>).url as string;
      const text = await fetchPageContent(url);
      return { content: [{ type: "text" as const, text }], details: undefined };
    },
  };
}
