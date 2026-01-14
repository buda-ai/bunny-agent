import path from "node:path";
import { SandAgent } from "@sandagent/core";
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { SandockSandbox } from "@sandagent/sandbox-sandock";
import {
  type UIMessage,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";

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
 *   ANTHROPIC_API_KEY?: string,          // Client-provided API key
 *   ANTHROPIC_BASE_URL?: string,         // Client-provided base URL (optional)
 *   AWS_BEARER_TOKEN_BEDROCK?: string,   // Client-provided AWS Bedrock token (optional)
 *   E2B_API_KEY?: string,                // Client-provided E2B key
 *   SANDOCK_API_KEY?: string,            // Client-provided Sandock key
 *   SANDBOX_PROVIDER?: string,           // 'e2b', 'sandock', or 'daytona'
 *   DAYTONA_AUTO_STOP_INTERVAL?: number, // Daytona auto-stop interval in minutes (default: 15)
 *   DAYTONA_AUTO_DELETE_INTERVAL?: number, // Daytona auto-delete interval in minutes (default: -1, disabled)
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
    AWS_BEARER_TOKEN_BEDROCK,
    E2B_API_KEY,
    SANDOCK_API_KEY,
    DAYTONA_API_KEY,
    DAYTONA_AUTO_STOP_INTERVAL,
    DAYTONA_AUTO_DELETE_INTERVAL,
    SANDBOX_PROVIDER = "e2b",
  } = body;

  // Extract signal from Request object
  const signal = request.signal;

  // Debug logging (remove in production)
  console.log("[API] Request body keys:", Object.keys(body));
  console.log("[API] Has ANTHROPIC_API_KEY:", !!ANTHROPIC_API_KEY);
  console.log(
    "[API] Has AWS_BEARER_TOKEN_BEDROCK:",
    !!AWS_BEARER_TOKEN_BEDROCK,
  );
  console.log("[API] Has E2B_API_KEY:", !!E2B_API_KEY);
  console.log("[API] Has SANDOCK_API_KEY:", !!SANDOCK_API_KEY);
  console.log("[API] Has DAYTONA_API_KEY:", !!DAYTONA_API_KEY);
  console.log("[API] SANDBOX_PROVIDER:", SANDBOX_PROVIDER);
  if (SANDBOX_PROVIDER === "daytona") {
    console.log(
      "[API] DAYTONA_AUTO_STOP_INTERVAL:",
      DAYTONA_AUTO_STOP_INTERVAL ?? "15 (default)",
    );
    console.log(
      "[API] DAYTONA_AUTO_DELETE_INTERVAL:",
      DAYTONA_AUTO_DELETE_INTERVAL ?? "-1 (disabled, default)",
    );
  }

  // Validate required fields
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Either ANTHROPIC_API_KEY or AWS_BEARER_TOKEN_BEDROCK is required
  if (!ANTHROPIC_API_KEY && !AWS_BEARER_TOKEN_BEDROCK) {
    return new Response(
      JSON.stringify({
        error:
          "Either ANTHROPIC_API_KEY or AWS_BEARER_TOKEN_BEDROCK is required. Please configure one in Settings.",
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

  if (SANDBOX_PROVIDER === "daytona" && !DAYTONA_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "DAYTONA_API_KEY is required when using Daytona sandbox. Please configure it in Settings.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Convert AI SDK message format to simple format
  // AI SDK: { role, parts: [{ type: 'text', text: '...' }] }
  // Process only the last message
  const lastMessage = messages?.[messages.length - 1];
  if (!lastMessage) {
    return new Response(JSON.stringify({ error: "No messages provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let normalizedMessage: {
    role: "user" | "assistant" | "system";
    content: string;
  };

  // Check if last assistant message is complete with tool calls
  if (lastAssistantMessageIsCompleteWithToolCalls({ messages })) {
    // Find tool result (tool part with output-available state)
    const toolResult = lastMessage.parts?.find(
      (part: UIMessage["parts"][number]) =>
        isToolUIPart(part) && part.state === "output-available",
    );
    // Return tool result as user message with JSON string output
    normalizedMessage = {
      role: "user",
      content: JSON.stringify(toolResult.output || {}),
    };
  } else {
    // If role is user, return text part
    const textPart = lastMessage.parts
      ?.map((part: UIMessage["parts"][number]) =>
        part.type === "text" ? part.text : "",
      )
      .join(" ");
    normalizedMessage = {
      role: lastMessage.role,
      content: textPart || "",
    };
  }

  const normalizedMessages = [normalizedMessage];

  // Create sandbox based on provider
  let sandbox;

  if (SANDBOX_PROVIDER === "daytona") {
    // For Daytona, use template as reuseKey to enable sandbox reuse
    // Sandboxes with the same template will be reused instead of creating new ones
    const reuseKey = `template-${template}`;

    sandbox = new DaytonaSandbox({
      apiKey: DAYTONA_API_KEY,
      runnerBundlePath: RUNNER_BUNDLE_PATH,
      templatesPath: path.join(TEMPLATES_PATH, template),
      volumeName: `sandagent-${template}`,
      // Reuse key enables sandbox reuse - same template = same sandbox
      reuseKey,
      // Configurable auto-stop interval (default: 15 minutes)
      autoStopInterval: DAYTONA_AUTO_STOP_INTERVAL ?? 15,
      // Configurable auto-delete interval (default: -1, disabled)
      autoDeleteInterval: DAYTONA_AUTO_DELETE_INTERVAL ?? -1,
    });

    console.log(`[API] Daytona sandbox configured with reuseKey: ${reuseKey}`);
  } else if (SANDBOX_PROVIDER === "sandock") {
    sandbox = new SandockSandbox({
      apiKey: SANDOCK_API_KEY,
      runnerBundlePath: RUNNER_BUNDLE_PATH,
      templatesPath: path.join(TEMPLATES_PATH, template),
    });
  } else {
    sandbox = new E2BSandbox({
      apiKey: E2B_API_KEY,
      runnerBundlePath: RUNNER_BUNDLE_PATH,
      templatesPath: path.join(TEMPLATES_PATH, template),
    });
  }

  // Determine model based on whether using AWS Bedrock
  const model = ANTHROPIC_API_KEY
    ? "claude-sonnet-4-20250514" // Standard Anthropic model ID
    : "us.anthropic.claude-sonnet-4-20250514-v1:0"; // AWS Bedrock model ID

  const agent = new SandAgent({
    id: sessionId,
    sandbox,
    runner: {
      kind: "claude-agent-sdk",
      model,
      template,
      approvalDir: "/sandagent/approvals",
    },
    // Pass environment variables to the sandbox
    // Prioritize ANTHROPIC_API_KEY over AWS_BEARER_TOKEN_BEDROCK
    env: ANTHROPIC_API_KEY
      ? {
          ANTHROPIC_API_KEY,
          ...(ANTHROPIC_BASE_URL && { ANTHROPIC_BASE_URL }),
        }
      : AWS_BEARER_TOKEN_BEDROCK
        ? {
            CLAUDE_CODE_USE_BEDROCK: "1",
            AWS_BEARER_TOKEN_BEDROCK,
          }
        : {},
  });

  return agent.stream({
    messages: normalizedMessages,
    workspace: { path: "/sandagent" },
    resume,
    signal, // Pass signal to SandAgent
  });
}
