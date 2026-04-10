/**
 * SandAgent Extension for pi TUI
 * Registers sandagent tools: web_search, web_fetch, generate_image
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { buildImageGenerateTool } from "@sandagent/runner-harness/image-tools";
import { buildWebFetchTool, buildWebSearchTool } from "@sandagent/runner-harness/web-tools";

export default function sandagentExtension(pi: ExtensionAPI) {
  const env = process.env as Record<string, string>;

  pi.registerTool(buildWebFetchTool());

  try {
    pi.registerTool(buildWebSearchTool(env));
  } catch {
    // No BRAVE_API_KEY or TAVILY_API_KEY — skip silently
  }

  const imageModel = env.IMAGE_GENERATION_MODEL;
  const openaiKey = env.OPENAI_API_KEY;
  const openaiBase = env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  if (imageModel && openaiKey) {
    pi.registerTool(buildImageGenerateTool(process.cwd(), imageModel, openaiBase, openaiKey));
  }
}
