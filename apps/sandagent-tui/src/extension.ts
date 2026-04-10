/**
 * SandAgent extension for pi TUI.
 * Registers web_search, web_fetch, generate_image tools from runner-harness.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  buildImageGenerateTool,
  buildWebFetchTool,
  buildWebSearchTool,
} from "@sandagent/runner-harness/tools";

export default function sandagentExtension(pi: ExtensionAPI) {
  const env = process.env as Record<string, string>;

  pi.registerTool(buildWebFetchTool());

  try {
    pi.registerTool(buildWebSearchTool(env));
  } catch {
    // No search API key — DDG fallback is built-in, but buildWebSearchTool
    // doesn't throw anymore; this catch is just safety.
  }

  const imageModel = env.IMAGE_GENERATION_MODEL;
  const openaiKey = env.OPENAI_API_KEY;
  const openaiBase = env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  if (imageModel && openaiKey) {
    pi.registerTool(
      buildImageGenerateTool(process.cwd(), imageModel, openaiBase, openaiKey),
    );
  }
}
