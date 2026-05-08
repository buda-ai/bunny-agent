import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { ToolDetailsWithUsage } from "./tool-details.js";

// ---------------------------------------------------------------------------
// Provider Interface
// ---------------------------------------------------------------------------

export type VideoTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface VideoTaskState {
  status: VideoTaskStatus;
  /** Present when status === "succeeded". */
  videoUrl?: string;
  /** Present when status === "failed". */
  error?: string;
  /** Optional 0-100 when the provider reports it. */
  progress?: number;
}

type Env = Record<string, string>;

export interface VideoGenerationProvider {
  /** Provider identifier (e.g. "byteplus", "sora", "runway"). */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Env var names required to activate this provider. */
  envKeys: string[];
  /** Default poll interval in ms. Defaults to 10_000 if omitted. */
  pollIntervalMs?: number;

  create(opts: {
    prompt: string;
    env: Env;
    signal?: AbortSignal;
  }): Promise<{ taskId: string }>;

  poll(opts: {
    taskId: string;
    env: Env;
    signal?: AbortSignal;
  }): Promise<VideoTaskState>;

  /**
   * Best-effort cancel. Implementations should swallow or report "cannot
   * cancel in current state" rather than throwing — abort is already the
   * error path, we don't want to mask the original cause.
   */
  cancel(opts: { taskId: string; env: Env }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Provider: BytePlus / Volcengine Ark (Seedance 2.0)
// ---------------------------------------------------------------------------

function resolveArkConfig(env: Env) {
  const apiKey = env.ARK_API_KEY ?? process.env.ARK_API_KEY;
  const modelId =
    env.ARK_MODEL_ID ?? process.env.ARK_MODEL_ID ?? "dreamina-seedance-2-0";
  const baseUrl =
    env.ARK_BASE_URL ??
    process.env.ARK_BASE_URL ??
    "https://ark.ap-southeast.bytepluses.com/api/v3";
  if (!apiKey) throw new Error("Missing ARK_API_KEY");
  return { apiKey, modelId, baseUrl };
}

interface ArkCreateResponse {
  id?: string;
}

interface ArkGetResponse {
  status?: string;
  content?: Array<{ video?: { url?: string } }>;
  error?: { message?: string } | string;
}

function mapArkStatus(raw: string | undefined): VideoTaskStatus {
  switch (raw) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "cancelled":
      return "cancelled";
    case "failed":
    case "unknown":
    default:
      return "failed";
  }
}

const byteplusProvider: VideoGenerationProvider = {
  id: "byteplus",
  label: "BytePlus Ark",
  envKeys: ["ARK_API_KEY"],
  pollIntervalMs: 10_000,

  async create({ prompt, env, signal }) {
    const { apiKey, modelId, baseUrl } = resolveArkConfig(env);
    const res = await fetch(`${baseUrl}/contents/generations/tasks`, {
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
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `Failed to create video task: ${res.status} ${errorText}`,
      );
    }
    const data = (await res.json()) as ArkCreateResponse;
    if (!data.id) {
      throw new Error("No task ID returned from video generation API");
    }
    return { taskId: data.id };
  },

  async poll({ taskId, env, signal }) {
    const { apiKey, baseUrl } = resolveArkConfig(env);
    const res = await fetch(`${baseUrl}/contents/generations/tasks/${taskId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `Failed to check task status: ${res.status} ${errorText}`,
      );
    }
    const data = (await res.json()) as ArkGetResponse;
    const status = mapArkStatus(data.status);
    const state: VideoTaskState = { status };
    if (status === "succeeded") {
      state.videoUrl = data.content?.[0]?.video?.url;
    } else if (status === "failed") {
      state.error =
        typeof data.error === "string"
          ? data.error
          : (data.error?.message ?? `Task status: ${data.status}`);
    }
    return state;
  },

  async cancel({ taskId, env }) {
    // Use a fresh signal so the cancel request itself isn't aborted by the
    // caller's already-aborted signal. Keep the timeout short — this is
    // best-effort cleanup, not a critical path.
    const { apiKey, baseUrl } = resolveArkConfig(env);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5_000);
    try {
      await fetch(`${baseUrl}/contents/generations/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: ctl.signal,
      });
      // Non-2xx is expected when the task is running / already cancelled —
      // Ark only allows DELETE on queued/succeeded/failed/expired. We don't
      // throw or log here since there is no onUpdate channel at cancel time.
    } finally {
      clearTimeout(timer);
    }
  },
};

// ---------------------------------------------------------------------------
// Registry & Resolution
// ---------------------------------------------------------------------------

const PROVIDERS: VideoGenerationProvider[] = [byteplusProvider];

function getEnv(env: Env | undefined, key: string): string | undefined {
  const v = env?.[key] ?? process.env[key];
  return v && v.length > 0 ? v : undefined;
}

export function resolveVideoProvider(
  env: Env | undefined,
): VideoGenerationProvider | null {
  for (const p of PROVIDERS) {
    const hasAllKeys = p.envKeys.every((key) => getEnv(env, key) !== undefined);
    if (hasAllKeys) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Abortable sleep
// ---------------------------------------------------------------------------

function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Tool Builder
// ---------------------------------------------------------------------------

/**
 * Build a `generate_video` ToolDefinition with auto-detected provider.
 * Returns null if no video provider is configured in the environment.
 */
export function buildVideoGenerateTool(
  env: Env | undefined,
): ToolDefinition | null {
  const provider = resolveVideoProvider(env);
  if (!provider) return null;

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
    } as any,
    execute: async (_toolCallId, params, signal, onUpdate) => {
      const { prompt } = params as { prompt: string };
      const resolvedEnv: Env = env ?? {};

      const report = (msg: string) =>
        onUpdate?.({
          content: [{ type: "text", text: msg }],
          details: {},
        } as any);

      report(`[${provider.label}] Submitting video generation task...`);
      const { taskId } = await provider.create({
        prompt,
        env: resolvedEnv,
        signal,
      });
      report(
        `[${provider.label}] Task ${taskId} submitted. Polling for completion...`,
      );

      const intervalMs = provider.pollIntervalMs ?? 10_000;
      let videoUrl: string | undefined;
      try {
        while (true) {
          await sleepAbortable(intervalMs, signal);
          const state = await provider.poll({
            taskId,
            env: resolvedEnv,
            signal,
          });
          if (state.status === "succeeded") {
            videoUrl = state.videoUrl ?? "URL not found in response payload";
            break;
          }
          if (state.status === "failed" || state.status === "cancelled") {
            throw new Error(
              `Video task ended with status: ${state.status}${
                state.error ? `. ${state.error}` : ""
              }`,
            );
          }
          const progress =
            state.progress != null ? ` (${state.progress}%)` : "";
          report(`[${provider.label}] Task status: ${state.status}${progress}`);
        }
      } catch (err) {
        if (signal?.aborted) {
          // Best-effort cancel — Ark only honors DELETE while the task is
          // queued, so this may silently no-op on a running task.
          await provider
            .cancel({ taskId, env: resolvedEnv })
            .catch(() => undefined);
        }
        throw err;
      }

      const details: ToolDetailsWithUsage = { usage: { raw: {} } };
      return {
        content: [
          {
            type: "text",
            text: `Video generated successfully via ${provider.label}!\nURL: ${videoUrl}\n(Task ID: ${taskId})`,
          } as any,
        ],
        details,
      };
    },
  };
}
