import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type BunnyAgentProviderSettings,
  createBunnyAgent,
  DEFAULT_BUNNY_AGENT_DAEMON_URL,
  isBunnyAgentDaemonHealthy,
} from "@bunny-agent/sdk";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type FileUIPart,
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

/** POST /api/ai JSON body; nested `env` is merged so clients can group credentials. */
interface AiChatRequestBody {
  messages?: UIMessage[];
  template?: string;
  resume?: string;
  RUNNER?: string;
  MODEL_ID?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  AWS_BEARER_TOKEN_BEDROCK?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
  LITELLM_MASTER_KEY?: string;
  ANTHROPIC_BEDROCK_BASE_URL?: string;
  CLAUDE_CODE_USE_BEDROCK?: string;
  CLAUDE_CODE_SKIP_BEDROCK_AUTH?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string;
  E2B_API_KEY?: string;
  SANDOCK_API_KEY?: string;
  DAYTONA_API_KEY?: string;
  SANDBOX_PROVIDER?: string;
  BRAVE_API_KEY?: string;
  TAVILY_API_KEY?: string;
  USE_BUNNY_AGENT_DAEMON?: string | number | boolean;
  /** Stripped after merge; only nested keys are lifted into the top level. */
  env?: Record<string, unknown>;
}

/**
 * POST /api/ai
 *
 * Stream AI SDK UI messages from a BunnyAgent.
 * Sandbox is cached per chat (keyed by template) and released when the
 * stream finishes.
 */
export async function POST(request: Request) {
  const raw = (await request.json()) as Record<string, unknown>;
  const nestedEnv =
    raw.env != null && typeof raw.env === "object" && !Array.isArray(raw.env)
      ? (raw.env as Record<string, unknown>)
      : {};
  const { env: _nestedEnvOmitted, ...topLevel } = raw;
  const body = { ...nestedEnv, ...topLevel } as AiChatRequestBody;
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

  const useBunnyAgentDaemon =
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
      content: JSON.stringify(toolResult?.output ?? {}),
    };
  } else {
    const textParts: string[] = [];
    const filePaths: string[] = [];

    // Workspace directory for saving uploaded files
    const workspaceDir = join(process.cwd(), "workspace");

    for (const part of lastMessage.parts ?? []) {
      if (part.type === "text") {
        textParts.push(part.text);
      } else if (part.type === "file") {
        const filePart = part as FileUIPart;
        // Save file to workspace and record the path
        try {
          const url = filePart.url ?? "";
          const ext =
            filePart.mediaType?.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
          const filename = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const filePath = join(workspaceDir, filename);

          let buffer: Buffer | undefined;
          if (url.startsWith("data:")) {
            // data URL → base64
            const b64 = url.split(",")[1];
            if (b64) {
              buffer = Buffer.from(b64, "base64");
            }
          }

          if (buffer) {
            mkdirSync(workspaceDir, { recursive: true });
            writeFileSync(filePath, buffer);
            filePaths.push(filePath);
          }
        } catch (e) {
          console.error("[api/ai] Failed to save uploaded file:", e);
        }
      }
    }

    let content = textParts.join(" ");
    if (filePaths.length > 0) {
      const pathList = filePaths.map((p) => `  - ${p}`).join("\n");
      content += `\n\n[User uploaded ${filePaths.length} file(s) to the workspace:\n${pathList}\n]`;
    }

    normalizedMessage = { role: lastMessage.role, content: content || "" };
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
    useBunnyAgentDaemon,
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
      // Already in provider:model form; keep as-is.
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
      if (useBunnyAgentDaemon) {
        const handle = await sandbox.attach();
        const daemonOk = await isBunnyAgentDaemonHealthy(
          handle,
          DEFAULT_BUNNY_AGENT_DAEMON_URL,
          { cwd: handle.getWorkdir(), signal },
        );
        console.info("[api/ai] daemon health check", {
          sandboxProvider: SANDBOX_PROVIDER,
          sandboxId: handle.getSandboxId(),
          daemonUrl: DEFAULT_BUNNY_AGENT_DAEMON_URL,
          daemonOk,
        });
        if (daemonOk) {
          daemonUrl = DEFAULT_BUNNY_AGENT_DAEMON_URL;
        }
      }

      console.info("[api/ai] runner mode", {
        useBunnyAgentDaemon,
        daemonEnabled: daemonUrl != null,
        runnerType,
        model,
      });

      const bunnyAgentOptions: BunnyAgentProviderSettings = {
        sandbox,
        ...(daemonUrl ? { daemonUrl } : {}),
        cwd: sandbox.getWorkdir?.() || "/bunny-agent",
        runnerType,
        verbose: true,
        artifactProcessors: [artifactProcessor],
        resume,
        systemPrompt: "============test============",
        // Passed to RunnerSpec via createBunnyAgent merge (not only bunnyAgent(model, { skillPaths }))
        skillPaths: [
          "/Users/zhengxu/vika/kapps/apps/buda/agent-templates/system-skills",
          "/Users/zhengxu/vika/kapps/apps/buda/agent-templates/company-templates/entire-company/finance-agent/.agents/skills",
        ],
      };
      const bunnyAgent = createBunnyAgent(bunnyAgentOptions);

      const result = streamText({
        model: bunnyAgent(model),
        messages: normalizedMessages,
        abortSignal: signal,
        onFinish: (event) => {
          const stepMetadata = event.steps
            .map((step) => step.providerMetadata)
            .filter((meta) => meta != null);
          console.info("[api/ai] stream finished", {
            finishReason: event.finishReason,
            usage: event.usage,
            totalUsage: event.totalUsage,
            providerMetadata: event.providerMetadata,
            stepMetadataCount: stepMetadata.length,
          });
        },
        onError: (event) => {
          console.error("[api/ai] stream error", event.error);
        },
      });

      writer.merge(result.toUIMessageStream({ sendSources: true }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
