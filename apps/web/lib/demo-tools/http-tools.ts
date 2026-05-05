import { bunnyHttpTool } from "@bunny-agent/sdk";
import type { Tool, ToolExecutionOptions, ToolSet } from "ai";

const DEMO_TOOL_ROUTE_PREFIX = "/api/demo-tools";

export function createDemoHttpTools(
  tools: ToolSet,
  requestUrl: string,
): Record<string, Tool<any, never>> {
  const origin = new URL(requestUrl).origin;
  return Object.fromEntries(
    Object.entries(tools).map(([name, demoTool]) => [
      name,
      bunnyHttpTool({
        description: demoTool.description,
        inputSchema: demoTool.inputSchema,
        endpoint: {
          url: `${origin}${DEMO_TOOL_ROUTE_PREFIX}/${encodeURIComponent(name)}`,
        },
      }),
    ]),
  );
}

export async function executeDemoTool(
  tools: ToolSet,
  name: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const tool = tools[name];
  if (!tool) {
    throw new Error(`unknown demo tool "${name}"`);
  }
  if (typeof tool.execute !== "function") {
    throw new Error(`demo tool "${name}" has no execute function`);
  }
  return tool.execute(input as never, {
    toolCallId: "",
    messages: [],
    abortSignal: signal,
  } satisfies ToolExecutionOptions);
}
