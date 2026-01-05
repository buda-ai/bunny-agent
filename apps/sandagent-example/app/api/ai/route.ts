import path from "node:path";
import { SandAgent } from "@sandagent/core";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { SandockSandbox } from "@sandagent/sandbox-sandock";
import type { UIMessage } from "ai";

// Resolve paths relative to the monorepo root
const MONOREPO_ROOT = path.resolve(process.cwd(), "../..");
const RUNNER_BUNDLE_PATH = path.join(
  MONOREPO_ROOT,
  "apps/runner-cli/dist/bundle.mjs",
);
const TEMPLATES_PATH = path.join(MONOREPO_ROOT, "templates");

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
 *   ANTHROPIC_API_KEY?: string,     // Client-provided API key
 *   ANTHROPIC_BASE_URL?: string,    // Client-provided base URL (optional)
 *   E2B_API_KEY?: string,           // Client-provided E2B key
 *   SANDOCK_API_KEY?: string,       // Client-provided Sandock key
 *   SANDBOX_PROVIDER?: string,      // 'e2b' or 'sandock'
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
    resume,
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    E2B_API_KEY,
    SANDOCK_API_KEY,
    SANDBOX_PROVIDER = "e2b",
  } = body;

  // Debug logging (remove in production)
  console.log("[API] Request body keys:", Object.keys(body));
  console.log("[API] Has ANTHROPIC_API_KEY:", !!ANTHROPIC_API_KEY);
  console.log("[API] Has E2B_API_KEY:", !!E2B_API_KEY);
  console.log("[API] Has SANDOCK_API_KEY:", !!SANDOCK_API_KEY);
  console.log("[API] SANDBOX_PROVIDER:", SANDBOX_PROVIDER);

  // Validate required fields
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "ANTHROPIC_API_KEY is required. Please configure it in Settings.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Validate sandbox provider and corresponding API key
  if (SANDBOX_PROVIDER === "e2b" && !E2B_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "E2B_API_KEY is required when using E2B sandbox. Please configure it in Settings.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (SANDBOX_PROVIDER === "sandock" && !SANDOCK_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "SANDOCK_API_KEY is required when using Sandock sandbox. Please configure it in Settings.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Convert AI SDK message format to simple format
  // AI SDK: { role, parts: [{ type: 'text', text: '...' }] }
  const normalizedMessages = (messages || []).map((msg: UIMessage) => {
    if (Array.isArray(msg.parts)) {
      const textPart = msg.parts.find((p) => p.type === "text");
      return {
        role: msg.role,
        content: textPart?.text || "",
      };
    }
    return msg;
  });

  // Create sandbox based on provider
  const sandbox =
    SANDBOX_PROVIDER === "sandock"
      ? new SandockSandbox({
          apiKey: SANDOCK_API_KEY,
        })
      : new E2BSandbox({
          apiKey: E2B_API_KEY,
          runnerBundlePath: RUNNER_BUNDLE_PATH,
          templatesPath: TEMPLATES_PATH,
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
      ...(ANTHROPIC_BASE_URL && { ANTHROPIC_BASE_URL }),
    },
  });

  return agent.stream({
    messages: normalizedMessages,
    workspace: { path: "/sandagent" },
    resume,
  });
}
