import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import type { ToolDefinition } from "./types.js";

export interface ImageGenerationUsage {
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { image_tokens?: number; text_tokens?: number };
}

/**
 * Image tool result `details`. The full provider response is intentionally NOT
 * included: it can carry a multi-MB base64 image payload that, once persisted
 * by the agent runtime into its session log, bloats the file (the same image
 * is already saved to disk via `filePath`). Keep only the file path and a
 * compact usage record.
 */
export interface ImageToolDetails {
  filePath: string | undefined;
  usage?: ImageGenerationUsage;
}

async function resolveB64(item: {
  b64_json?: string;
  url?: string;
}): Promise<string | undefined> {
  if (item.b64_json) return item.b64_json;
  if (item.url) {
    const res = await fetch(item.url);
    if (res.ok) return Buffer.from(await res.arrayBuffer()).toString("base64");
  }
  return undefined;
}

export async function saveImageItem(
  item: { b64_json?: string; url?: string },
  filePath: string,
): Promise<string | undefined> {
  const b64 = await resolveB64(item);
  if (!b64) return undefined;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, Buffer.from(b64, "base64"));
  return filePath;
}

export function buildImageGenerateTool(
  cwd: string,
  imageModelId: string,
  baseUrl: string,
  apiKey: string,
): ToolDefinition {
  return {
    name: "generate_image",
    label: "generate image",
    description:
      "Generate an image from a text prompt. Saves to disk and returns the file path.",
    promptSnippet: "generate_image(prompt, filename?, size?, quality?)",
    promptGuidelines: [
      "Use when the user asks to create, draw, or visualize something.",
    ],
    parameters: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string" },
        filename: { type: "string", description: "e.g. 'cat.png'" },
        size: {
          type: "string",
          enum: [
            "256x256",
            "512x512",
            "1024x1024",
            "1792x1024",
            "1024x1792",
            "1280x1280",
            "1568x1056",
            "1056x1568",
            "1472x1088",
            "1088x1472",
            "1728x960",
            "960x1728",
          ],
        },
        quality: { type: "string", enum: ["standard", "hd"] },
      },
      additionalProperties: false,
    },
    async execute(_id, params, _signal, _onUpdate) {
      const p = params as Record<string, unknown>;
      const prompt = p.prompt as string;
      const size = (p.size as string) ?? "1024x1024";
      const quality = (p.quality as string) ?? "standard";
      const rawFilename = p.filename as string | undefined;
      const filename = rawFilename
        ? extname(rawFilename)
          ? rawFilename
          : `${rawFilename}.png`
        : `image_${Date.now()}.png`;
      const filePath = join(cwd, filename.replace(/[^a-zA-Z0-9_\-./]/g, "_"));

      try {
        const res = await fetch(
          `${baseUrl.replace(/\/$/, "")}/v1/images/generations`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: imageModelId,
              prompt,
              n: 1,
              size,
              quality,
            }),
          },
        );
        if (!res.ok)
          throw new Error(
            `Image generation failed (${res.status}): ${await res.text()}`,
          );
        const json = (await res.json()) as {
          data: Array<{ b64_json?: string; url?: string }>;
          usage?: ImageGenerationUsage;
        };
        const saved = await saveImageItem(json.data?.[0] ?? {}, filePath);
        return {
          content: [
            {
              type: "text" as const,
              text: saved ?? "Generated but could not be saved.",
            },
          ],
          details: {
            filePath: saved,
            ...(json.usage != null ? { usage: json.usage } : {}),
          } satisfies ImageToolDetails,
        };
      } catch (e: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Image generation error: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          details: undefined,
        };
      }
    },
  };
}
