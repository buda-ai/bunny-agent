import {
  createBunnyAgent,
  DEFAULT_BUNNY_AGENT_DAEMON_URL,
  isSandagentDaemonHealthy,
  type BunnyAgentProviderSettings,
} from "@bunny-agent/sdk";
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
import { DEFAULT_RUNNER, type RunnerType } from "@/lib/runner";

/**
 * POST /api/ai
 *
 * Stream AI SDK UI messages from a BunnyAgent.
 * Sandbox is cached per chat (keyed by template) and released when the
 * stream finishes.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const {
    messages,
    template = "default",
    resume,
    RUNNER,
    MODEL_ID,
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    AWS_BEARER_TOKEN_BEDROCK,
    ANTHROPIC_AUTH_TOKEN,
    LITELLM_MASTER_KEY,
    ANTHROPIC_BEDROCK_BASE_URL,
    CLAUDE_CODE_USE_BEDROCK,
    CLAUDE_CODE_SKIP_BEDROCK_AUTH,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    E2B_API_KEY,
    SANDOCK_API_KEY,
    DAYTONA_API_KEY,
    SANDBOX_PROVIDER = "e2b",
    BRAVE_API_KEY,
    TAVILY_API_KEY,
    /** When true, provider may pass `daemonUrl` after an in-sandbox `/healthz` probe; otherwise CLI runner. */
    USE_BUNNY_AGENT_DAEMON,
  } = body;

  const useSandagentDaemon =
    USE_BUNNY_AGENT_DAEMON === true ||
    USE_BUNNY_AGENT_DAEMON === 1 ||
    USE_BUNNY_AGENT_DAEMON === "1" ||
    USE_BUNNY_AGENT_DAEMON === "true" ||
    process.env.BUNNY_AGENT_USE_DAEMON === "1";

  const signal = request.signal;

  // Same logic as @bunny-agent/runner-claude hasClaudeAuth (supports Bedrock proxy)
  const hasClaudeAuth =
    !!ANTHROPIC_API_KEY ||
    !!AWS_BEARER_TOKEN_BEDROCK ||
    !!ANTHROPIC_AUTH_TOKEN ||
    !!LITELLM_MASTER_KEY ||
    (CLAUDE_CODE_USE_BEDROCK === "1" && !!ANTHROPIC_BEDROCK_BASE_URL);
  const runnerType = ((RUNNER ?? DEFAULT_RUNNER).toLowerCase() ||
    DEFAULT_RUNNER) as RunnerType;
  // Pi supports multiple providers: OpenAI, Gemini, or Anthropic (same as Claude)
  const hasPiAuth = !!OPENAI_API_KEY || !!GEMINI_API_KEY || hasClaudeAuth;

  // --- Validation -----------------------------------------------------------
  if (runnerType === "pi") {
    if (!hasPiAuth) {
      return new Response(
        JSON.stringify({
          error:
            "Pi runner requires at least one provider key: OPENAI_API_KEY, GEMINI_API_KEY, or Claude/Bedrock auth. Configure in Settings.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  } else if (!hasClaudeAuth) {
    return new Response(
      JSON.stringify({
        error:
          "Claude auth is required. Set one of: ANTHROPIC_API_KEY, AWS_BEARER_TOKEN_BEDROCK, ANTHROPIC_AUTH_TOKEN, LITELLM_MASTER_KEY, or Bedrock proxy (CLAUDE_CODE_USE_BEDROCK=1 + ANTHROPIC_BEDROCK_BASE_URL). Configure in Settings.",
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
    runnerType,
    E2B_API_KEY,
    SANDOCK_API_KEY,
    DAYTONA_API_KEY,
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    AWS_BEARER_TOKEN_BEDROCK,
    ANTHROPIC_AUTH_TOKEN,
    LITELLM_MASTER_KEY,
    ANTHROPIC_BEDROCK_BASE_URL,
    CLAUDE_CODE_USE_BEDROCK,
    CLAUDE_CODE_SKIP_BEDROCK_AUTH,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    template,
    useSandagentDaemon,
    env: {
      AGENT_KEY: process.env.AGENT_KEY ?? "",
      BUDA_API_URL: process.env.BUDA_API_URL ?? "",
      ...(BRAVE_API_KEY ? { BRAVE_API_KEY } : {}),
      ...(TAVILY_API_KEY ? { TAVILY_API_KEY } : {}),
    },
  };

  const sandbox = await getOrCreateSandbox(sandboxParams);

  // Clean up cached sandbox when the client disconnects
  signal.addEventListener("abort", () => evictSandbox(sandboxParams), {
    once: true,
  });

  // --- Model ----------------------------------------------------------------
  const defaultModel = ANTHROPIC_API_KEY
    ? "glm-4.7"
    : "global.anthropic.claude-opus-4-6-v1";
  let model = MODEL_ID || defaultModel;
  // Pi expects "<provider>:<model>" (e.g. openai:gpt-5.4, anthropic:claude-opus-4-6-v1)
  if (runnerType === "pi") {
    if (model.includes(":")) {
      // Already in provider:model form
    } else if (model.startsWith("global.anthropic.")) {
      model = `anthropic:${model.slice("global.anthropic.".length)}`;
    } else if (model.includes("/")) {
      // e.g. "openai/gpt-5.4" -> "openai:gpt-5.4"
      const [provider, ...rest] = model.split("/");
      model = `${provider}:${rest.join("/")}`;
    } else {
      // No slash/colon: infer provider from model name so "gpt-5.4" -> openai, "claude-*" -> anthropic
      const lower = model.toLowerCase();
      const provider =
        lower.startsWith("gpt-") ||
        lower.startsWith("o1-") ||
        lower.startsWith("o3-")
          ? "openai"
          : lower.startsWith("claude-")
            ? "anthropic"
            : lower.startsWith("gemini-")
              ? "google"
              : "openai";
      model = `${provider}:${model}`;
    }
  }

  // --- Stream ---------------------------------------------------------------
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const artifactProcessor = new TaskDrivenArtifactProcessor({
        sandbox,
        workdir: sandbox.getWorkdir?.() || "/bunny-agent",
        writer,
      });

      let daemonUrl: string | undefined;
      if (useSandagentDaemon) {
        const handle = await sandbox.attach();
        const daemonOk = await isSandagentDaemonHealthy(
          handle,
          DEFAULT_BUNNY_AGENT_DAEMON_URL,
          { cwd: handle.getWorkdir(), signal },
        );
        if (daemonOk) {
          daemonUrl = DEFAULT_BUNNY_AGENT_DAEMON_URL;
        }
      }

      const bunnyAgentOptions: BunnyAgentProviderSettings = {
        sandbox,
        ...(daemonUrl ? { daemonUrl } : {}),
        cwd: sandbox.getWorkdir?.() || "/bunny-agent",
        runnerType,
        verbose: true,
        artifactProcessors: [artifactProcessor],
        resume,
        systemPrompt: "============test============",
        // Passed to RunnerSpec via createBunnyAgent merge (not only bunny-agent(model, { skillPaths }))
        skillPaths: [
          "/Users/zhengxu/vika/kapps/apps/buda/agent-templates/system-skills",
          "/Users/zhengxu/vika/kapps/apps/buda/agent-templates/company-templates/entire-company/finance-agent/.agents/skills",
        ],
      };
      const bunnyAgent = createBunnyAgent(bunnyAgentOptions);

      const result = streamText({
        model: bunny-agent(model),
        messages: normalizedMessages,
        abortSignal: signal,
      });

      writer.merge(result.toUIMessageStream({ sendSources: true }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
