/**
 * Image generation tool for sandagent pi runner.
 *
 * Reuses the chat model's provider config (baseUrl + apiKey) — only the model ID differs.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

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
        "Output filename without extension. Defaults to a timestamp-based name.",
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
        "Image dimensions. Common sizes: 1024x1024 (square), 1280x1280, 1568x1056 (landscape), " +
        "1056x1568 (portrait), 1728x960 (wide), 960x1728 (tall). " +
        "Custom: width and height must be multiples of 32, between 512px and 2048px.",
    },
    quality: {
      type: "string",
      enum: ["standard", "hd"],
      description:
        "Image quality (OpenAI images API only). Defaults to standard.",
    },
  },
  required: ["prompt"],
  additionalProperties: false,
};

async function generateImage(
  prompt: string,
  modelId: string,
  size: string,
  quality: string,
  baseUrl: string,
  apiKey: string,
): Promise<{ b64: string; revisedPrompt?: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/images/generations`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      prompt,
      n: 1,
      size,
      quality,
    }),
  });
  if (!res.ok)
    throw new Error(
      `Image generation failed (${res.status}): ${await res.text()}`,
    );
  const json = (await res.json()) as {
    data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  };
  const item = json.data[0];
  if (!item) throw new Error("Provider returned no image data.");

  let b64: string;
  if (item.b64_json) {
    b64 = item.b64_json;
  } else if (item.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok)
      throw new Error(`Failed to download image from URL: ${imgRes.status}`);
    b64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
  } else {
    throw new Error("Provider returned neither b64_json nor url.");
  }

  return { b64, revisedPrompt: item.revised_prompt };
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
      "Generate an image from a text prompt and save it as a PNG file in the current working directory. " +
      "Returns the saved file path.",
    promptSnippet:
      "generate_image(prompt, filename?, size?, quality?) - generate an image from text",
    promptGuidelines: [
      "Use generate_image when the user asks to create, draw, or visualize something.",
      "Be descriptive in the prompt — more detail produces better results.",
      "Provide a meaningful filename so the user can find the file easily.",
    ],
    // biome-ignore lint/suspicious/noExplicitAny: plain JSON Schema compatible with TypeBox TSchema
    parameters: generateImageSchema as any,
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const p = params as Record<string, unknown>;
      const prompt = p.prompt as string;
      const size = (p.size as string) ?? "1024x1024";
      const quality = (p.quality as string) ?? "standard";
      const rawFilename = p.filename as string | undefined;
      const hasExt = rawFilename && /\.[a-z]+$/i.test(rawFilename);
      const filename = rawFilename
        ? rawFilename.replace(/[^a-zA-Z0-9_\-.]/g, "_")
        : `image_${Date.now()}.png`;
      const filePath = join(cwd, hasExt ? filename : `${filename}.png`);

      try {
        const { b64, revisedPrompt } = await generateImage(
          prompt,
          imageModelId,
          size,
          quality,
          baseUrl,
          apiKey,
        );

        writeFileSync(filePath, Buffer.from(b64, "base64"));

        const lines = [
          `Image generated using ${imageModelId}.`,
          `Saved to: ${filePath}`,
        ];
        if (revisedPrompt && revisedPrompt !== prompt) {
          lines.push(`Revised prompt: ${revisedPrompt}`);
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          details: undefined,
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
