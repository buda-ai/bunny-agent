// Minimal ToolDefinition compatible with @mariozechner/pi-coding-agent extension API
export interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  // biome-ignore lint/suspicious/noExplicitAny: JSON Schema
  parameters: any;
  execute(
    toolCallId: string,
    // biome-ignore lint/suspicious/noExplicitAny: dynamic params
    params: any,
    signal: AbortSignal | undefined,
    // biome-ignore lint/suspicious/noExplicitAny: update callback
    onUpdate: any,
  ): Promise<{
    content: Array<{ type: "text"; text: string }>;
    details: unknown;
  }>;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  age?: string;
  content?: string;
}
