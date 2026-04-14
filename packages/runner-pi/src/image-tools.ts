/**
 * Image generation tool for bunny-agent pi runner.
 *
 * Reuses the chat model's provider config (baseUrl + apiKey) — only the model ID differs.
 * Returns filePath and the raw API response as details.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

export interface ImageGenerationUsage {
  total_tokens?: number;
  input_tokens?: number;
  input_tokens_details?: { image_tokens?: number; text_tokens?: number };
  output_tokens?: number;
}

export interface ImageGenerationResponse {
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  usage?: ImageGenerationUsage;
}

export interface ImageToolDetails {
  filePath: string | undefined;
  response: ImageGenerationResponse;
}

const generateImageSchema = {
  type: "object",
  properties: {
    prompt: {
      type: "string",
      description: "Text description of the image to generate.",
    },
    filename: {
      type: "string",
      description:
        "Output filename with extension, e.g. 'cat.png'. Defaults to a timestamp-based name.",
    },
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
      description:
        "Image dimensions. Common: 1024x1024 (square), 1280x1280, 1568x1056 (landscape), " +
        "1056x1568 (portrait), 1728x960 (wide), 960x1728 (tall).",
    },
    quality: {
      type: "string",
      enum: ["standard", "hd"],
      description: "Image quality (OpenAI only). Defaults to standard.",
    },
  },
  required: ["prompt"],
  additionalProperties: false,
};

/**
 * Resolve b64 from an image item (b64_json or url).
 */
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

/**
 * Save a single image item (b64_json or url) to disk.
 * Returns the saved file path, or undefined if no image data was available.
 */
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
      "Generate an image from a text prompt. Saves the image to disk and returns the file path.",
    promptSnippet:
      "generate_image(prompt, filename?, size?, quality?) - generate an image from text",
    promptGuidelines: [
      "Use generate_image when the user asks to create, draw, or visualize something.",
      "Be descriptive in the prompt — more detail produces better results.",
      "Provide a filename with extension, e.g. 'cat.png'.",
    ],
    // biome-ignore lint/suspicious/noExplicitAny: plain JSON Schema compatible with TypeBox TSchema
    parameters: generateImageSchema as any,
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const p = params as Record<string, unknown>;
      const prompt = p.prompt as string;
      const size = (p.size as string) ?? "1024x1024";
      const quality = (p.quality as string) ?? "standard";
      const rawFilename = p.filename as string | undefined;

      // Ensure filename has an extension
      const filename = rawFilename
        ? extname(rawFilename)
          ? rawFilename
          : `${rawFilename}.png`
        : `image_${Date.now()}.png`;
      const filePath = join(cwd, filename.replace(/[^a-zA-Z0-9_\-./]/g, "_"));

      try {
        const url = `${baseUrl.replace(/\/$/, "")}/v1/images/generations`;
        const res = await fetch(url, {
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
        });

        if (!res.ok) {
          throw new Error(
            `Image generation failed (${res.status}): ${await res.text()}`,
          );
        }

        const json = (await res.json()) as {
          data: Array<{
            b64_json?: string;
            url?: string;
            revised_prompt?: string;
          }>;
        };

        const item = json.data?.[0] ?? {};
        const savedPath = await saveImageItem(item, filePath);

        return {
          content: [
            {
              type: "text" as const,
              text: savedPath ?? "Image generated but could not be saved.",
            },
          ],
          details: {
            filePath: savedPath,
            response: json,
          } satisfies ImageToolDetails,
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [
            { type: "text" as const, text: `Image generation error: ${msg}` },
          ],
          details: undefined,
        };
      }
    },
  };
}
