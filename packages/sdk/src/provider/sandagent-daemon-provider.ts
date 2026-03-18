import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from "@ai-sdk/provider";
import { SandAgentLanguageModel } from "./sandagent-language-model";
import type { SandAgentModelId, SandAgentProviderSettings } from "./types";

export interface DaemonProviderSettings {
  /** Base URL of the sandagent-daemon, e.g. "http://localhost:3080" */
  daemonUrl: string;
  /** Runner to use: claude, pi, gemini, codex, opencode (default: claude) */
  runner?: string;
  /** Working directory inside the sandbox (default: SANDAGENT_ROOT) */
  cwd?: string;
  /** Resume session ID */
  resume?: string;
  /** Override system prompt */
  systemPrompt?: string;
  /** Max agent turns */
  maxTurns?: number;
  /** Allowed tools */
  allowedTools?: string[];
  /** Extra skill paths (pi runner) */
  skillPaths?: string[];
}

const emptyUsage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: undefined, reasoning: undefined },
} as const;
class DaemonLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "sandagent-daemon";
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  constructor(
    modelId: string,
    private settings: DaemonProviderSettings,
  ) {
    this.modelId = modelId;
  }

  async doGenerate(options: LanguageModelV3CallOptions) {
    const { stream, request } = await this.doStream(options);
    const reader = stream.getReader();
    const parts: LanguageModelV3StreamPart[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    // Extract text content from parts
    const textMap = new Map<string, string>();
    for (const part of parts) {
      if (part.type === "text-start") textMap.set(part.id, "");
      if (part.type === "text-delta") {
        textMap.set(part.id, (textMap.get(part.id) ?? "") + part.delta);
      }
    }
    const content = [...textMap.entries()].map(([, text]) => ({
      type: "text" as const,
      text,
    }));
    const finish = parts.find((p) => p.type === "finish");
    return {
      content,
      finishReason:
        finish?.type === "finish"
          ? finish.finishReason
          : { unified: "other" as const, raw: undefined },
      usage: finish?.type === "finish" ? finish.usage : emptyUsage,
      warnings: [],
      request: request,
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { prompt, abortSignal } = options;

    // Extract user input from the last user message
    const lastUser = [...prompt].reverse().find((m) => m.role === "user");
    const userInput =
      lastUser?.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n") ?? "";

    const body = {
      runner: this.settings.runner ?? "claude",
      model: this.modelId,
      userInput,
      cwd: this.settings.cwd,
      resume: this.settings.resume,
      systemPrompt: this.settings.systemPrompt,
      maxTurns: this.settings.maxTurns,
      allowedTools: this.settings.allowedTools,
      skillPaths: this.settings.skillPaths,
    };

    const response = await fetch(`${this.settings.daemonUrl}/api/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abortSignal,
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `daemon error: ${response.status} ${response.statusText}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const msg = JSON.parse(line) as Record<string, unknown>;
                // Map daemon NDJSON to AI SDK stream parts
                if (msg.type === "text-delta") {
                  controller.enqueue({
                    type: "text-delta",
                    id: msg.id as string,
                    delta: msg.delta as string,
                  });
                } else if (msg.type === "text-start") {
                  controller.enqueue({
                    type: "text-start",
                    id: msg.id as string,
                  });
                } else if (msg.type === "text-end") {
                  controller.enqueue({
                    type: "text-end",
                    id: msg.id as string,
                  });
                } else if (msg.type === "finish") {
                  controller.enqueue({
                    type: "finish",
                    finishReason: { unified: "stop", raw: "stop" },
                    usage: emptyUsage,
                  });
                }
              } catch {
                /* skip unparseable lines */
              }
            }
          }
        } catch (err) {
          controller.error(err);
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return { stream, request: { body: JSON.stringify(body) } };
  }
}

/**
 * Create a SandAgent provider that uses sandagent-daemon as transport.
 * Use this for local dev (Next.js embed) or when daemon is running in a container.
 *
 * @example
 * ```ts
 * import { createSandAgentDaemon } from "@sandagent/sdk";
 *
 * const sandagent = createSandAgentDaemon({
 *   daemonUrl: "http://localhost:3080",
 *   runner: "claude",
 * });
 *
 * const { text } = await generateText({
 *   model: sandagent("claude-sonnet-4-20250514"),
 *   prompt: "Build a REST API",
 * });
 * ```
 */
export function createSandAgentDaemon(settings: DaemonProviderSettings) {
  const createModel = (
    modelId: SandAgentModelId,
    overrides: Partial<DaemonProviderSettings> = {},
  ): LanguageModelV3 => {
    return new DaemonLanguageModel(modelId, { ...settings, ...overrides });
  };

  const provider = (
    modelId: SandAgentModelId,
    overrides?: Partial<DaemonProviderSettings>,
  ) => createModel(modelId, overrides);
  provider.languageModel = createModel;
  provider.chat = createModel;
  provider.specificationVersion = "v3" as const;
  provider.embeddingModel = () => {
    throw new Error("not supported");
  };
  provider.textEmbeddingModel = () => {
    throw new Error("not supported");
  };
  provider.imageModel = () => {
    throw new Error("not supported");
  };

  return provider;
}
