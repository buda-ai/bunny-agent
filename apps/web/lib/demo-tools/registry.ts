export interface DemoToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: unknown, ctx: { signal: AbortSignal }): Promise<unknown>;
}

/**
 * Demo tool registry for the apps/web `tools` end-to-end test.
 *
 * The route turns these plain definitions into AI SDK `tool()` entries. The
 * SDK handles transport details for host-side `execute` callbacks.
 */
const tools: DemoToolDefinition[] = [
  {
    name: "get_current_time",
    description:
      "Return the current ISO-8601 timestamp. Use this when the user asks for the current time, today's date, or how long since some event.",
    inputSchema: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description:
            'Optional IANA timezone name, e.g. "UTC" or "Asia/Shanghai". Defaults to UTC.',
        },
      },
      required: [],
    },
    async execute(input) {
      const { timezone } = (input as { timezone?: unknown }) ?? {};
      const now = new Date();
      const tz = typeof timezone === "string" && timezone ? timezone : "UTC";
      return {
        iso: now.toISOString(),
        timezone: tz,
        formatted: new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          dateStyle: "full",
          timeStyle: "long",
        }).format(now),
      };
    },
  },
  {
    name: "compute_word_count",
    description:
      "Count the number of words in a piece of text. Useful when the user asks for word counts, length checks, or similar text statistics.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text whose words should be counted.",
        },
      },
      required: ["text"],
    },
    async execute(input) {
      const { text } = (input as { text?: unknown }) ?? {};
      const value = typeof text === "string" ? text : "";
      const words = value.trim().length === 0 ? [] : value.trim().split(/\s+/);
      return { wordCount: words.length, charCount: value.length };
    },
  },
];

export function getDemoTools(): DemoToolDefinition[] {
  return tools;
}
