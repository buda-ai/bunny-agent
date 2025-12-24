import { createAgentHandler } from "@sandagent/sdk";
import { SandAgent } from "@sandagent/core";
import { E2BSandbox } from "@sandagent/sandbox-e2b";

/**
 * POST /api/ai
 *
 * Stream AI SDK UI messages from a SandAgent.
 *
 * Request body:
 * {
 *   sessionId: string,
 *   messages: [{ role: "user" | "assistant", content: string }],
 *   workspace?: { path?: string }
 * }
 *
 * Response:
 * AI SDK UI stream (passthrough from sandbox CLI)
 */
export const POST = createAgentHandler({
  createAgent: ({ sessionId }) =>
    new SandAgent({
      id: sessionId,
      sandbox: new E2BSandbox(),  // E2B is the recommended default
      runner: {
        kind: "claude-agent-sdk",
        model: "claude-sonnet-4-20250514",
        template: "default",  // Use default template
      },
    }),
});
