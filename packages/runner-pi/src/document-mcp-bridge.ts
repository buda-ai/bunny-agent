import type {
  ExtensionAPI,
  ExtensionFactory,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { DocumentSourceRegistry } from "./document-registry.js";
import type { McpConfig } from "./mcp-config.js";
import { sourceReference } from "./source-registry.js";

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
/** Wrap only adapter-owned executions. No text, user shell, or JSON scraping. */
export function withDocumentReadBridge(
  factory: ExtensionFactory,
  config: McpConfig,
  registry: DocumentSourceRegistry,
): ExtensionFactory {
  return (pi) =>
    factory(
      new Proxy(pi, {
        get(target, property, receiver) {
          if (
            property !== "registerTool" &&
            property !== "registerDeferredTool"
          )
            return Reflect.get(target, property, receiver);
          const register = Reflect.get(target, property, receiver);
          if (typeof register !== "function") return register;
          return (tool: ToolDefinition) =>
            register.call(target, {
              ...tool,
              async execute(...args: Parameters<ToolDefinition["execute"]>) {
                const result = await tool.execute(...args);
                const details = object(result.details);
                const raw = object(details?.mcpResult);
                const server = details?.server;
                const originalTool = details?.tool;
                if (
                  details?.error ||
                  raw?.isError ||
                  typeof server !== "string" ||
                  typeof originalTool !== "string" ||
                  !config.mcpServers[server]?.documentReadTools?.includes(
                    originalTool,
                  )
                )
                  return result;
                const structured = object(raw?.structuredContent);
                const namespace = object(structured?.["bunny-agent"]);
                const sources = registry.registerRead(
                  namespace?.document_read,
                  server,
                  args[0],
                );
                if (sources.length === 0) return result;
                return {
                  ...result,
                  content: [
                    ...result.content,
                    {
                      type: "text" as const,
                      text:
                        "Document evidence References (cite only the exact Reference after a supported statement as [[cite:<Reference>]]; do not invent pages or locators):\n" +
                        sources
                          .map((source) =>
                            JSON.stringify({
                              reference: sourceReference(source.source_id),
                              title: source.document.title,
                              path: source.document.path,
                              locator: source.locator,
                            }),
                          )
                          .join("\n"),
                    },
                  ],
                };
              },
            });
        },
      }) as ExtensionAPI,
    );
}
