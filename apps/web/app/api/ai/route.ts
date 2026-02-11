import {
  createSandAgent,
  type SandAgentProviderSettings,
} from "@sandagent/sdk";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  streamText,
  type UIMessage,
} from "ai";
import { TaskDrivenArtifactProcessor } from "@/lib/example/artifact-processor";
import {
  type CreateSandboxParams,
  evictSandbox,
  getOrCreateSandbox,
} from "@/lib/example/create-sandbox";

/**
 * POST /api/ai
 *
 * Stream AI SDK UI messages from a SandAgent.
 * Sandbox is cached per chat (keyed by template) and released when the
 * stream finishes.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const {
    messages,
    template = "default",
    resume,
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    AWS_BEARER_TOKEN_BEDROCK,
    E2B_API_KEY,
    SANDOCK_API_KEY,
    DAYTONA_API_KEY,
    SANDBOX_PROVIDER = "e2b",
  } = body;

  const signal = request.signal;

  // --- Validation -----------------------------------------------------------
  if (!ANTHROPIC_API_KEY && !AWS_BEARER_TOKEN_BEDROCK) {
    return new Response(
      JSON.stringify({
        error:
          "Either ANTHROPIC_API_KEY or AWS_BEARER_TOKEN_BEDROCK is required. Please configure one in Settings.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (SANDBOX_PROVIDER === "e2b" && !E2B_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "E2B_API_KEY is required when using E2B sandbox.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (SANDBOX_PROVIDER === "sandock" && !SANDOCK_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "SANDOCK_API_KEY is required when using Sandock sandbox.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (SANDBOX_PROVIDER === "daytona" && !DAYTONA_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "DAYTONA_API_KEY is required when using Daytona sandbox.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- Normalize last message -----------------------------------------------
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

  if (lastAssistantMessageIsCompleteWithToolCalls({ messages })) {
    const toolResult = lastMessage.parts?.find(
      (part: UIMessage["parts"][number]) =>
        isToolUIPart(part) && part.state === "output-available",
    );
    normalizedMessage = {
      role: "user",
      content: JSON.stringify(toolResult.output || {}),
    };
  } else {
    const textPart = lastMessage.parts
      ?.map((part: UIMessage["parts"][number]) =>
        part.type === "text" ? part.text : "",
      )
      .join(" ");
    normalizedMessage = { role: lastMessage.role, content: textPart || "" };
  }

  const normalizedMessages = [normalizedMessage];

  // --- Sandbox (cached per chat) --------------------------------------------
  const sandboxParams: CreateSandboxParams = {
    SANDBOX_PROVIDER,
    E2B_API_KEY,
    SANDOCK_API_KEY,
    DAYTONA_API_KEY,
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    template,
  };

  const sandbox = await getOrCreateSandbox(sandboxParams);

  // Clean up cached sandbox when the client disconnects
  signal.addEventListener("abort", () => evictSandbox(sandboxParams), {
    once: true,
  });

  // --- Model ----------------------------------------------------------------
  const model = ANTHROPIC_API_KEY
    ? "glm-4.7"
    : "us.anthropic.claude-sonnet-4-20250514-v1:0";

  // --- Stream ---------------------------------------------------------------
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const artifactProcessor = new TaskDrivenArtifactProcessor({
        sandbox,
        workdir: sandbox.getWorkdir?.() || "/sandagent",
        writer,
      });

      const sandagentOptions: SandAgentProviderSettings = {
        sandbox,
        cwd: sandbox.getWorkdir?.() || "/sandagent",
        verbose: true,
        artifactProcessors: [artifactProcessor],
        resume,
      };
      const sandagent = createSandAgent(sandagentOptions);

      const result = streamText({
        model: sandagent(model),
        messages: normalizedMessages,
        abortSignal: signal,
      });

      writer.merge(result.toUIMessageStream({ sendSources: true }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
