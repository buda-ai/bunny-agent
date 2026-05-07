import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { ToolDetailsWithUsage } from "./tool-details.js";

// ---------------------------------------------------------------------------
// Provider Interface
// ---------------------------------------------------------------------------

export interface VideoGenerationProvider {
  /** Provider identifier (e.g. "byteplus", "sora", "runway") */
  id: string;
  /** Human-readable label */
  label: string;
  /** Env var names required to activate this provider */
  envKeys: string[];
  /** Execute generation */
  generate(options: {
    prompt: string;
    env: Record<string, string>;
    signal?: AbortSignal;
    onUpdate: (msg: string) => void;
  }): Promise<{ videoUrl: string; taskId?: string }>;
}

// ---------------------------------------------------------------------------
// Provider: BytePlus Ark (Seedance 2.0)
// ---------------------------------------------------------------------------

const byteplusProvider: VideoGenerationProvider = {
  id: "byteplus",
  label: "BytePlus Ark",
  envKeys: ["ARK_API_KEY"],
  async generate({ prompt, env, signal, onUpdate }) {
    const apiKey = env.ARK_API_KEY ?? process.env.ARK_API_KEY;
    const modelId = 
      env.ARK_MODEL_ID ?? process.env.ARK_MODEL_ID ?? "dreamina-seedance-2-0";
    const baseUrl =
      env.ARK_BASE_URL ??
      process.env.ARK_BASE_URL ??
      "https://ark.ap-southeast.bytepluses.com/api/v3";

    if (!apiKey) {
      throw new Error("Missing ARK_API_KEY");
    }

    onUpdate(`[${this.label}] Submitting video generation task...`);

    const createRes = await fetch(`${baseUrl}/contents/generations/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        content: [{ type: "text", text: prompt }],
      }),
      signal,
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      throw new Error(`Failed to create video task: ${createRes.status} ${errorText}`);
    }

    const createData = await createRes.json();
    const taskId = createData.id;
    if (!taskId) {
      throw new Error("No task ID returned from video generation API");
    }

    onUpdate(`[${this.label}] Task created (ID: ${taskId}). Polling for completion...`);

    let finalData = null;
    while (true) {
      if (signal?.aborted) throw new Error("Video generation was aborted.");

      // Poll every 10 seconds
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const getRes = await fetch(`${baseUrl}/contents/generations/tasks/${taskId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      });

      if (!getRes.ok) {
        const errorText = await getRes.text();
        throw new Error(`Failed to check task status: ${getRes.status} ${errorText}`);
      }

      const getData = await getRes.json();
      const status = getData.status;

      if (status === "succeeded") {
        finalData = getData;
        break;
      } else if (["failed", "cancelled", "unknown"].includes(status)) {
        throw new Error(
          `Video task ended with status: ${status}. Response: ${JSON.stringify(getData)}`,
        );
      }

      onUpdate(`[${this.label}] Task status: ${status}...`);
    }

    const videoUrl =
      finalData?.content?.[0]?.video?.url || "URL not found in response payload";

    return { videoUrl, taskId };
  },
};

// ---------------------------------------------------------------------------
// Registry & Resolution
// ---------------------------------------------------------------------------

const PROVIDERS: VideoGenerationProvider[] = [byteplusProvider];
// Future providers like soraProvider, runwayProvider can be added here.

function getEnv(env: Record<string, string>, key: string): string | undefined {
  const v = env[key] ?? process.env[key];
  return v && v.length > 0 ? v : undefined;
}

export function resolveVideoProvider(
  env: Record<string, string>,
): VideoGenerationProvider | null {
  for (const p of PROVIDERS) {
    const hasAllKeys = p.envKeys.every((key) => getEnv(env, key) !== undefined);
    if (hasAllKeys) {
      return p;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tool Builder
// ---------------------------------------------------------------------------

/**
 * Build a `generate_video` ToolDefinition with auto-detected provider.
 * Returns null if no video provider is configured in the environment.
 */
export function buildVideoGenerateTool(
  env: Record<string, string>,
): ToolDefinition | null {
  const provider = resolveVideoProvider(env);

  if (!provider) {
    return null;
  }

  return {
    name: "generate_video",
    label: `Video Generator (${provider.label})`,
    description: "Generate a video from a text prompt. Returns the video URL.",
    promptSnippet: "generate_video(prompt)",
    promptGuidelines: [
      "Use this when the user wants to generate, create, or render a video.",
      "Provide a highly descriptive prompt.",
    ],
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Text description of the video to generate.",
        },
      },
      required: ["prompt"],
    },
    execute: async (toolCallId, params, signal, onUpdate) => {
      const { prompt } = params as { prompt: string };

      const { videoUrl, taskId } = await provider.generate({
        prompt,
        env,
        signal,
        onUpdate,
      });

      const details: ToolDetailsWithUsage = {
        usage: {
          // Future: map detailed token/credit usage if the provider returns it.
        },
      };

      return {
        content: [
          {
            type: "text",
            text: `Video generated successfully via ${provider.label}!\nURL: ${videoUrl}\n${taskId ? `(Task ID: ${taskId})` : ""}`,
          },
        ],
        details,
      };
    },
  };
}