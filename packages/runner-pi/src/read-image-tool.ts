import type { Api, Model } from "@earendil-works/pi-ai";
import {
  createReadTool,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { redactSecrets } from "./tool-overrides.js";

type ImageModel = Pick<Model<Api>, "id" | "input">;

/** Refuse image input before Pi can silently replace it with a placeholder. */
export function assertImageInputSupported(model: ImageModel): void {
  if (!model.input.includes("image")) {
    throw new Error(
      `Model "${model.id}" does not support image input. Switch to an image-capable model or use your existing OCR tools.`,
    );
  }
}

/** Build a native image reader using Pi's format detection and image resizing. */
export function buildReadImageTool(
  cwd: string,
  getModel: () => ImageModel,
  secrets: Record<string, string> = {},
): ToolDefinition {
  const read = createReadTool(cwd);
  return {
    name: "read_image",
    label: "ReadImage",
    description:
      "Read an image file and return the image itself to the current vision model. " +
      "Supports PNG, JPEG, GIF, WebP and BMP; large images are resized automatically. " +
      "Use existing OCR tools for text-only models. This tool does not perform OCR.",
    parameters: Type.Object({
      file_path: Type.String({
        minLength: 1,
        description:
          "Image file path, relative to the working directory or absolute",
      }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      signal?.throwIfAborted();
      assertImageInputSupported(ctx?.model ?? getModel());
      const filePath = (params as { file_path: string }).file_path;
      if (typeof filePath !== "string" || !filePath.trim()) {
        throw new Error("file_path must be a non-empty string");
      }
      const result = await read.execute(
        toolCallId,
        { path: filePath },
        signal,
        onUpdate,
      );
      signal?.throwIfAborted();
      if (!result.content.some((block) => block.type === "image")) {
        throw new Error(
          "Cannot read this file as an image: unsupported format, corrupt image, or image processing failed. " +
            "Use a valid PNG, JPEG, GIF, WebP or BMP file.",
        );
      }
      return {
        ...result,
        content: result.content.map((block) =>
          block.type === "text"
            ? { ...block, text: redactSecrets(block.text, secrets) }
            : block,
        ),
      };
    },
  };
}
