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
 *   template?: string,
 *   ANTHROPIC_API_KEY?: string,  // Client-provided API key
 *   E2B_API_KEY?: string,        // Client-provided E2B key
 *   SANDBOX_PROVIDER?: string,   // 'e2b' or 'sandock'
 *   workspace?: { path?: string }
 * }
 *
 * Response:
 * AI SDK UI stream (passthrough from sandbox CLI)
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { 
    sessionId, 
    messages, 
    template = "default",
    ANTHROPIC_API_KEY,
    E2B_API_KEY,
    SANDBOX_PROVIDER = "e2b",
  } = body;

  // Validate required fields
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is required. Please configure it in Settings." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (SANDBOX_PROVIDER === "e2b" && !E2B_API_KEY) {
    return new Response(JSON.stringify({ error: "E2B_API_KEY is required when using E2B sandbox. Please configure it in Settings." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create sandbox with client-provided API key
  const sandbox = new E2BSandbox({
    apiKey: E2B_API_KEY,
  });

  const agent = new SandAgent({
    id: sessionId,
    sandbox,
    runner: {
      kind: "claude-agent-sdk",
      model: "claude-sonnet-4-20250514",
      template,
    },
    // Pass environment variables to the sandbox
    env: {
      ANTHROPIC_API_KEY,
    },
  });

  return agent.stream({
    messages,
    workspace: { path: "/workspace" },
  });
}
