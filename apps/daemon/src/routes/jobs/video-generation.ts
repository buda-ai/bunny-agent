import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ensureDir, resolveUnderRoot, resolveVolumeRoot } from "../../utils.js";
import type {
  DaemonJobHandler,
  DaemonJobHandlerContext,
  DaemonJobRecord,
  DaemonJobStatus,
  DaemonJobUpdate,
} from "./types.js";
import { DaemonJobHandlerError } from "./types.js";

type Env = Record<string, string | undefined>;

interface VideoGenerationInput {
  prompt: string;
  filePath: string;
  volume: "agent" | "space";
  attachments: VideoGenerationAttachment[];
}

interface VideoGenerationAttachment {
  path?: string;
  url?: string;
  mimeType?: string;
  name?: string;
  role?: string;
}

interface ArkContentItem {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

interface ArkCreateResponse {
  id?: string;
}

interface ArkGetResponse {
  status?: string;
  content?: Array<{ video?: { url?: string } }>;
  error?: { message?: string } | string;
}

function resolveArkConfig(env: Env = process.env) {
  const apiKey = env.ARK_API_KEY;
  const modelId = env.ARK_MODEL_ID ?? "dreamina-seedance-2-0";
  const baseUrl =
    env.ARK_BASE_URL ?? "https://ark.ap-southeast.bytepluses.com/api/v3";
  if (!apiKey) {
    throw new DaemonJobHandlerError(
      500,
      "missing_provider_config",
      "Missing ARK_API_KEY",
    );
  }
  return { apiKey, modelId, baseUrl };
}

function parseInput(input: unknown): VideoGenerationInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new DaemonJobHandlerError(
      400,
      "invalid_input",
      "input must be an object",
    );
  }
  const prompt = (input as { prompt?: unknown }).prompt;
  if (typeof prompt !== "string" || prompt.trim() === "") {
    throw new DaemonJobHandlerError(
      400,
      "invalid_input",
      "input.prompt is required",
    );
  }

  const raw = input as Record<string, unknown>;
  const rawFilePath = raw.file_path ?? raw.filePath ?? raw.output_path;
  if (typeof rawFilePath !== "string" || rawFilePath.trim() === "") {
    throw new DaemonJobHandlerError(
      400,
      "invalid_input",
      "input.file_path is required",
    );
  }
  const filePath = normalizeOutputPath(rawFilePath);
  const volume = parseOutputVolume(filePath, raw.volume);
  const attachments = parseAttachments(raw.attachments);

  return {
    prompt: buildPromptWithAttachmentHints(prompt.trim(), attachments),
    filePath,
    volume,
    attachments,
  };
}

function mapArkStatus(raw: string | undefined): DaemonJobStatus {
  if (raw === "failed" || raw === "unknown") return "failed";
  switch (raw) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "cancelled":
      return "cancelled";
    default:
      return "failed";
  }
}

function arkErrorMessage(raw: ArkGetResponse): string | undefined {
  if (typeof raw.error === "string") return raw.error;
  return raw.error?.message;
}

function firstArkVideoUrl(raw: ArkGetResponse): string | undefined {
  return raw.content?.[0]?.video?.url;
}

function normalizeOutputPath(value: string): string {
  const trimmed = value.trim();
  const withExtension = path.extname(trimmed) ? trimmed : `${trimmed}.mp4`;
  return withExtension.replace(/^\/+(?!(agent|space)(?:\/|$))/, "");
}

function parseOutputVolume(
  filePath: string,
  rawVolume: unknown,
): "agent" | "space" {
  if (rawVolume === "space" || filePath.startsWith("/space/")) return "space";
  return "agent";
}

function relativeOutputPath(
  filePath: string,
  volume: "agent" | "space",
): string {
  const prefix = `/${volume}/`;
  if (filePath.startsWith(prefix)) return filePath.slice(prefix.length);
  if (filePath === `/${volume}`) return "";
  return filePath.replace(/^\/+/, "");
}

function parseAttachments(value: unknown): VideoGenerationAttachment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new DaemonJobHandlerError(
      400,
      "invalid_input",
      "input.attachments must be an array",
    );
  }
  return value.map((item, index) => {
    if (typeof item === "string") {
      const pathOrUrl = item.trim();
      if (!pathOrUrl) {
        throw new DaemonJobHandlerError(
          400,
          "invalid_input",
          `input.attachments[${index}] is empty`,
        );
      }
      return pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
        ? { url: pathOrUrl }
        : { path: pathOrUrl };
    }
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new DaemonJobHandlerError(
        400,
        "invalid_input",
        `input.attachments[${index}] must be a string or object`,
      );
    }
    const raw = item as Record<string, unknown>;
    const attachment: VideoGenerationAttachment = {
      ...(typeof raw.path === "string" && raw.path.trim()
        ? { path: raw.path.trim() }
        : {}),
      ...(typeof raw.url === "string" && raw.url.trim()
        ? { url: raw.url.trim() }
        : {}),
      ...(typeof raw.mimeType === "string" && raw.mimeType.trim()
        ? { mimeType: raw.mimeType.trim() }
        : {}),
      ...(typeof raw.name === "string" && raw.name.trim()
        ? { name: raw.name.trim() }
        : {}),
      ...(typeof raw.role === "string" && raw.role.trim()
        ? { role: raw.role.trim() }
        : {}),
    };
    if (!attachment.path && !attachment.url) {
      throw new DaemonJobHandlerError(
        400,
        "invalid_input",
        `input.attachments[${index}] requires path or url`,
      );
    }
    return attachment;
  });
}

function buildPromptWithAttachmentHints(
  prompt: string,
  attachments: VideoGenerationAttachment[],
): string {
  if (attachments.length === 0) return prompt;
  const lines = attachments.map((attachment, index) => {
    const source = attachment.path ?? attachment.url ?? "unknown";
    const role = attachment.role ? ` (${attachment.role})` : "";
    return `- ${index + 1}. ${source}${role}`;
  });
  return `${prompt}\n\nReference attachments:\n${lines.join("\n")}`;
}

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function attachmentToContent(
  state: DaemonJobHandlerContext["state"],
  attachment: VideoGenerationAttachment,
): Promise<ArkContentItem | null> {
  if (attachment.url) {
    return { type: "image_url", image_url: { url: attachment.url } };
  }
  if (!attachment.path) return null;
  const volume = attachment.path.startsWith("/space/") ? "space" : "agent";
  const root = resolveVolumeRoot(state, volume);
  const relativePath =
    volume === "space"
      ? attachment.path.replace(/^\/space\/?/, "")
      : attachment.path.replace(/^\/agent\/?/, "");
  const target = resolveUnderRoot(root, relativePath);
  const buffer = await fs.readFile(target);
  const mimeType = attachment.mimeType ?? guessMimeType(target);
  if (!mimeType.startsWith("image/")) return null;
  return {
    type: "image_url",
    image_url: { url: `data:${mimeType};base64,${buffer.toString("base64")}` },
  };
}

async function buildArkContent(
  state: DaemonJobHandlerContext["state"],
  input: VideoGenerationInput,
): Promise<ArkContentItem[]> {
  const images = await Promise.all(
    input.attachments.map((attachment) =>
      attachmentToContent(state, attachment),
    ),
  );
  return [
    { type: "text", text: input.prompt },
    ...images.filter((item): item is ArkContentItem => item !== null),
  ];
}

async function readJsonOrText(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

async function createArkTask(
  input: VideoGenerationInput,
  context: DaemonJobHandlerContext,
): Promise<{ externalId: string; raw: unknown }> {
  const { apiKey, modelId, baseUrl } = resolveArkConfig(context.env);
  const content = await buildArkContent(context.state, input);
  const res = await fetch(`${baseUrl}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      content,
    }),
  });
  const raw = (await readJsonOrText(res)) as ArkCreateResponse;
  if (!res.ok) {
    throw new DaemonJobHandlerError(
      502,
      "provider_create_failed",
      `Failed to create video task: ${res.status}`,
    );
  }
  if (!raw.id) {
    throw new DaemonJobHandlerError(
      502,
      "provider_create_failed",
      "No task ID returned from video generation API",
    );
  }
  return { externalId: raw.id, raw };
}

async function queryArkTask(
  externalId: string,
  context: DaemonJobHandlerContext,
): Promise<{ status: DaemonJobStatus; raw: ArkGetResponse }> {
  const { apiKey, baseUrl } = resolveArkConfig(context.env);
  const res = await fetch(
    `${baseUrl}/contents/generations/tasks/${externalId}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );
  const raw = (await readJsonOrText(res)) as ArkGetResponse;
  if (!res.ok) {
    throw new DaemonJobHandlerError(
      502,
      "provider_query_failed",
      `Failed to check task status: ${res.status}`,
    );
  }
  return { status: mapArkStatus(raw.status), raw };
}

async function cancelArkTask(
  externalId: string,
  context: DaemonJobHandlerContext,
): Promise<unknown> {
  const { apiKey, baseUrl } = resolveArkConfig(context.env);
  const res = await fetch(
    `${baseUrl}/contents/generations/tasks/${externalId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );
  return readJsonOrText(res);
}

async function downloadVideo(
  context: DaemonJobHandlerContext,
  input: VideoGenerationInput,
  videoUrl: string,
): Promise<void> {
  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new DaemonJobHandlerError(
      502,
      "video_download_failed",
      `Video download failed: ${res.status}`,
    );
  }

  const root = resolveVolumeRoot(context.state, input.volume);
  const target = resolveUnderRoot(
    root,
    relativeOutputPath(input.filePath, input.volume),
  );
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, Buffer.from(await res.arrayBuffer()));
}

export const videoGenerationJobHandler: DaemonJobHandler = {
  kind: "video_generation",

  async create(
    input: unknown,
    context: DaemonJobHandlerContext,
  ): Promise<DaemonJobUpdate> {
    const created = await createArkTask(parseInput(input), context);
    return {
      status: "running",
      externalId: created.externalId,
      raw: created.raw,
    };
  },

  async sync(
    record: DaemonJobRecord,
    context: DaemonJobHandlerContext,
  ): Promise<DaemonJobUpdate> {
    if (!record.externalId) {
      return { status: record.status, raw: record.raw, error: record.error };
    }

    const queried = await queryArkTask(record.externalId, context);
    if (queried.status === "succeeded") {
      const videoUrl = firstArkVideoUrl(queried.raw);
      if (!videoUrl) {
        return {
          status: "failed",
          raw: queried.raw,
          error: {
            message: "provider final response did not include a video url",
            code: "missing_video_url",
          },
        };
      }
      await downloadVideo(context, parseInput(record.input), videoUrl);
    }

    if (queried.status === "failed") {
      return {
        status: "failed",
        raw: queried.raw,
        error: {
          message: arkErrorMessage(queried.raw) ?? "provider task failed",
          code: "provider_failed",
        },
      };
    }

    return {
      status: queried.status,
      raw: queried.raw,
    };
  },

  async cancel(
    record: DaemonJobRecord,
    context: DaemonJobHandlerContext,
  ): Promise<DaemonJobUpdate> {
    const raw =
      record.externalId &&
      record.status !== "succeeded" &&
      record.status !== "failed"
        ? await cancelArkTask(record.externalId, context)
        : record.raw;
    return {
      status: "cancelled",
      raw,
    };
  },
};
