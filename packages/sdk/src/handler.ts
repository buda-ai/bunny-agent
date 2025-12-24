import { SandAgent, type SandAgentOptions, type Message } from "@sandagent/core";

/**
 * Configuration for creating a SandAgent from request
 */
export interface CreateAgentFromRequestConfig {
  /** Factory function to create a SandAgent */
  createAgent: (options: { sessionId: string }) => SandAgent;
}

/**
 * Request body shape for agent streaming
 */
export interface AgentRequestBody {
  /** Session ID for the agent */
  sessionId: string;
  /** Messages to send to the agent */
  messages: Message[];
  /** Optional workspace configuration */
  workspace?: {
    path?: string;
  };
}

/**
 * Create a route handler for streaming agent responses.
 *
 * This is a helper for Next.js App Router that:
 * 1. Parses the request body
 * 2. Creates/resumes a SandAgent
 * 3. Streams the response directly (passthrough)
 *
 * @example
 * ```ts
 * // app/api/ai/route.ts
 * import { createAgentHandler } from "@sandagent/sdk";
 * import { SandAgent } from "@sandagent/core";
 * import { SandockSandbox } from "@sandagent/sandbox-sandock";
 *
 * export const POST = createAgentHandler({
 *   createAgent: ({ sessionId }) => new SandAgent({
 *     id: sessionId,
 *     sandbox: new SandockSandbox(),
 *     runner: {
 *       kind: "claude-agent-sdk",
 *       model: "claude-3-5-sonnet",
 *     },
 *   }),
 * });
 * ```
 */
export function createAgentHandler(
  config: CreateAgentFromRequestConfig
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      const body = (await req.json()) as AgentRequestBody;

      if (!body.sessionId) {
        return new Response(
          JSON.stringify({ error: "sessionId is required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      if (!body.messages || !Array.isArray(body.messages)) {
        return new Response(
          JSON.stringify({ error: "messages array is required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const agent = config.createAgent({ sessionId: body.sessionId });

      // Stream the response directly - no parsing, no modification
      return agent.stream({
        messages: body.messages,
        workspace: body.workspace,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(
        JSON.stringify({ error: message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  };
}

/**
 * Re-export SandAgent for convenience
 */
export { SandAgent } from "@sandagent/core";
export type { SandAgentOptions, Message } from "@sandagent/core";
