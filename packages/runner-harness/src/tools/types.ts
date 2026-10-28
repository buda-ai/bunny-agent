// Minimal ToolDefinition compatible with @mariozechner/pi-coding-agent extension API
import type { WebSearchCallRecord } from "@bunny-agent/manager/contracts";

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

/**
 * `web_search` tool result `details` shape. `web_search` (the validated v1
 * {@link WebSearchCallRecord}) is only present when the caller explicitly
 * selected `searchContractVersion: 1`; legacy (version-unspecified) calls
 * keep their current `details` shape unchanged.
 */
export interface WebSearchToolDetails {
  usage?: { raw: Record<string, { requests: number; fetchedPages: number }> };
  web_search?: WebSearchCallRecord;
}
