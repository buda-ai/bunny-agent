/**
 * Bunny Agent extension for pi TUI.
 *
 * 1. Injects Bunny Agent identity + research methodology into the system prompt
 *    (sourced from @sandagent/runner-harness so all runners share the same context).
 * 2. Registers web_search, web_fetch, generate_image tools.
 *    Note: bash, read, write, edit, find, grep, ls are built into pi-coding-agent.
 * 3. Registers custom OpenAI-compatible provider if OPENAI_BASE_URL is set,
 *    so `--model openai-compatible:<model-id>` works with proxy endpoints.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  BUNNY_AGENT_SYSTEM_PROMPT,
  buildImageGenerateTool,
  buildWebFetchTool,
  buildWebSearchTool,
} from "@sandagent/runner-harness";

export default function bunnyExtension(pi: ExtensionAPI) {
  const env = process.env as Record<string, string>;

  // System prompt: sourced from runner-harness so all runners share the same identity
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: BUNNY_AGENT_SYSTEM_PROMPT + "\n\n" + event.systemPrompt,
    };
  });

  // ---------------------------------------------------------------------------
  // Tools — bash/read/write/edit/find/grep/ls are built into pi-coding-agent
  // ---------------------------------------------------------------------------

  pi.registerTool(buildWebFetchTool());
  pi.registerTool(buildWebSearchTool(env));

  const imageModel = env.IMAGE_GENERATION_MODEL;
  const openaiKey = env.OPENAI_API_KEY;
  const openaiBase = env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  if (imageModel && openaiKey) {
    pi.registerTool(
      buildImageGenerateTool(process.cwd(), imageModel, openaiBase, openaiKey),
    );
  }

  // ---------------------------------------------------------------------------
  // Custom OpenAI-compatible provider
  // If OPENAI_BASE_URL is set, register a "proxy" provider so users can do
  // `--model proxy:<model-id>`. Also registers any models listed in
  // OPENAI_MODELS (comma-separated) under the "openai" provider override.
  // ---------------------------------------------------------------------------

  if (env.OPENAI_BASE_URL && env.OPENAI_API_KEY) {
    // Register extra models under "openai" provider via OPENAI_MODELS env var
    // e.g. OPENAI_MODELS=gemini-3.1-pro,gemini-3.1-flash
    const extraModels = (env.OPENAI_MODELS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (extraModels.length > 0) {
      // Override openai provider baseUrl + add extra models
      // We can't easily add to existing models, so register as a separate provider
      pi.registerProvider("openai-compatible", {
        baseUrl: env.OPENAI_BASE_URL,
        apiKey: env.OPENAI_API_KEY,
        api: "openai-completions",
        models: extraModels.map((id) => ({
          id,
          name: id,
          reasoning: false,
          input: ["text" as const, "image" as const],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1_000_000,
          maxTokens: 32_768,
        })),
      });
    } else {
      // Just override the openai provider baseUrl (keeps built-in model list)
      pi.registerProvider("openai", {
        baseUrl: env.OPENAI_BASE_URL,
        apiKey: env.OPENAI_API_KEY,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Anthropic proxy (ANTHROPIC_BASE_URL)
  // ---------------------------------------------------------------------------

  if (env.ANTHROPIC_BASE_URL && env.ANTHROPIC_API_KEY) {
    pi.registerProvider("anthropic", {
      baseUrl: env.ANTHROPIC_BASE_URL,
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }
}
