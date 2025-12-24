import { createAgentHandler } from "@sandagent/sdk";
import { SandAgent } from "@sandagent/core";
import { SandockSandbox } from "@sandagent/sandbox-sandock";

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
      sandbox: new SandockSandbox(),
      runner: {
        kind: "claude-agent-sdk",
        model: "claude-sonnet-4-20250514",
      },
    }),
});
