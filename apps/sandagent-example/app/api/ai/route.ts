import path from "node:path";
import { TaskDrivenArtifactProcessor } from "@/lib/artifact-processor";
// DaytonaSandbox is dynamically imported to avoid build-time dependency issues
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { SandockSandbox } from "@sandagent/sandbox-sandock";
import {
  LocalSandbox,
  type SandAgentProviderSettings,
  createSandAgent,
} from "@sandagent/sdk";
import {
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  pipeTextStreamToResponse,
  pipeUIMessageStreamToResponse,
  readUIMessageStream,
  streamText,
} from "ai";

// Resolve paths relative to the monorepo root
const MONOREPO_ROOT = path.resolve(process.cwd(), "../..");
const RUNNER_BUNDLE_PATH = path.join(
  MONOREPO_ROOT,
  "apps/runner-cli/dist/bundle.mjs",
);
const TEMPLATES_PATH = path.join(MONOREPO_ROOT, "templates");

/** Docker image for Sandock (pre-built SandAgent). Override with env SANDBOX_IMAGE. */
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? "vikadata/sandagent:0.1.0";

/**
 * POST /api/ai
 *
 * Stream AI SDK UI messages from a SandAgent.
 *
 * Request body:
 * {
 *   messages: [{ role: "user" | "assistant", content: string }],
 *   template?: string,
 *   ANTHROPIC_API_KEY?: string,          // Client-provided API key
 *   ANTHROPIC_BASE_URL?: string,         // Client-provided base URL (optional)
 *   AWS_BEARER_TOKEN_BEDROCK?: string,   // Client-provided AWS Bedrock token (optional)
 *   E2B_API_KEY?: string,                // Client-provided E2B key
 *   SANDOCK_API_KEY?: string,            // Client-provided Sandock key
 *   SANDBOX_PROVIDER?: string,           // 'e2b', 'sandock', or 'daytona'
 *   workspace?: { path?: string }
 * }
 *
 * Response:
 * AI SDK UI stream (passthrough from sandbox CLI)
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

  // Build env object, filtering out undefined values
  const env: Record<string, string> = {
    DEBUG_STREAM: "true",
  };
  if (ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
  if (ANTHROPIC_BASE_URL) env.ANTHROPIC_BASE_URL = ANTHROPIC_BASE_URL;
  // if (AWS_BEARER_TOKEN_BEDROCK) {
  //   env.AWS_BEARER_TOKEN_BEDROCK = AWS_BEARER_TOKEN_BEDROCK;
  //   env.CLAUDE_CODE_USE_BEDROCK = "1";
  // }

  // Create sandbox based on provider
  // env and workdir are now part of sandbox config
  let sandbox;
  const sandboxName = `sandagent-${template}`;

  if (SANDBOX_PROVIDER === "daytona") {
    // Dynamic import to avoid build-time dependency issues with @daytonaio/sdk
    const { DaytonaSandbox } = await import("@sandagent/sandbox-daytona");
    sandbox = new DaytonaSandbox({
      apiKey: DAYTONA_API_KEY,
      templatesPath: path.join(TEMPLATES_PATH, template),
      volumeName: sandboxName,
      volumeMountPath: "/workspace",
      name: sandboxName,
      autoStopInterval: 15,
      autoDeleteInterval: -1,
      // Sandbox-level config
      env,
      snapshot: "sandagent-claude-researcher:0.1.2",
      workdir: "/workspace",
    });
    console.log(`[API] Daytona sandbox configured with name: ${sandboxName}`);
  } else if (SANDBOX_PROVIDER === "sandock") {
    sandbox = new SandockSandbox({
      apiKey: SANDOCK_API_KEY,
      image: SANDBOX_IMAGE,
      skipBootstrap: true,
      templatesPath: path.join(TEMPLATES_PATH, template),
      volumeName: sandboxName,
      volumeMountPath: "/workspace",
      env,
      workdir: "/workspace",
      name: sandboxName,
    });
    console.log(
      `[API] Sandock sandbox configured with image: ${SANDBOX_IMAGE}, template: ${template}`,
    );
  } else if (SANDBOX_PROVIDER === "e2b") {
    sandbox = new E2BSandbox({
      apiKey: E2B_API_KEY,
      templatesPath: path.join(TEMPLATES_PATH, template),
      name: sandboxName,
      // Sandbox-level config
      env: {
        ...env,
        DEBUG: "true",
        API_TIMEOUT_MS: "3000000",
        // ANTHROPIC_AUTH_TOKEN: ANTHROPIC_API_KEY,
        // ANTHROPIC_BASE_URL: ANTHROPIC_BASE_URL,
        // CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.5-air",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-4.7",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-4.7",
      },
      workdir: "/workspace",
    });
  } else {
    sandbox = new LocalSandbox({
      workdir: path.join(process.cwd(), "workspace"),
      templatesPath: path.join(TEMPLATES_PATH, template),
      env: {
        ...env,
        DEBUG: "true",
        API_TIMEOUT_MS: "3000000",
        // ANTHROPIC_AUTH_TOKEN: ANTHROPIC_API_KEY,
        // ANTHROPIC_BASE_URL: ANTHROPIC_BASE_URL,
        // CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.5-air",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-4.7",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-4.7",
      },
      // test local bundle
      runnerCommand: ["node", RUNNER_BUNDLE_PATH, "run"],
      // use npm package
      // runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
    });
  }

  // Determine model based on whether using AWS Bedrock
  const model = ANTHROPIC_API_KEY
    ? "glm-4.7" // Standard Anthropic model ID
    : "us.anthropic.claude-sonnet-4-20250514-v1:0"; // AWS Bedrock model ID

  // Streaming - use createUIMessageStream to handle artifact data
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Create artifact processor
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
        onChunk(chunk) {
          // console.log("[Stream] Chunk:", chunk);
        },
      });
      // Merge the AI text stream - this starts consuming immediately
      writer.merge(
        result.toUIMessageStream({
          sendSources: true,
        }),
      );

      // await result.response;
    },
  });

  return createUIMessageStreamResponse({ stream });
}
