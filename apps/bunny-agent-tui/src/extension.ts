/**
 * Bunny Agent extension for pi TUI.
 *
 * 1. Injects Bunny Agent identity + research methodology into the system prompt
 *    (sourced from @bunny-agent/runner-harness so all runners share the same context).
 * 2. Registers web_search, web_fetch, generate_image tools.
 *    Note: bash, read, write, edit, find, grep, ls are built into pi-coding-agent.
 * 3. Registers custom OpenAI-compatible provider if OPENAI_BASE_URL is set,
 *    so `--model openai-compatible:<model-id>` works with proxy endpoints.
 * 4. Enables Bunny safety gates by default. Use `/yolo true|false` or
 *    `/permissions yolo|safe|status` to toggle them.
 */

import {
  BUNNY_AGENT_SYSTEM_PROMPT,
  buildImageGenerateTool,
  buildWebFetchTool,
  buildWebSearchTool,
} from "@bunny-agent/runner-harness";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type PermissionMode = "safe" | "yolo";

interface PermissionState {
  mode: PermissionMode;
}

const PERMISSION_STATE_TYPE = "bunny-permissions";
const PROTECTED_PATHS = [
  ".env",
  ".env.",
  ".git/",
  "node_modules/",
  "pnpm-lock.yaml.tmp",
];
const DANGEROUS_BASH_PATTERNS = [
  /\brm\s+(-rf?|-[a-zA-Z]*[rf][a-zA-Z]*)\b/i,
  /\bsudo\b/i,
  /\b(chmod|chown)\b.*\b777\b/i,
  /\bmkfs(\.| |$)/i,
  /\bdd\s+.*\bof=/i,
  /\bshutdown\b|\breboot\b|\bhalt\b/i,
];

function normalizePermissionMode(value: unknown): PermissionMode | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    ["safe", "guard", "guarded", "default", "false", "off"].includes(normalized)
  ) {
    return "safe";
  }
  if (["yolo", "unsafe", "bypass", "true", "on"].includes(normalized)) {
    return "yolo";
  }
  return undefined;
}

function getPathInput(input: Record<string, unknown>): string | undefined {
  const value = input.path ?? input.filePath ?? input.targetPath;
  return typeof value === "string" ? value : undefined;
}

function isProtectedPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return PROTECTED_PATHS.some((protectedPath) =>
    normalized.includes(protectedPath),
  );
}

function isDangerousBash(command: string): boolean {
  return DANGEROUS_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

export default function bunnyExtension(pi: ExtensionAPI) {
  const env = process.env as Record<string, string>;
  let permissionMode: PermissionMode =
    normalizePermissionMode(env.BUNNY_AGENT_PERMISSION) ?? "safe";

  pi.registerFlag("permission", {
    description: "Bunny permission mode: safe or yolo",
    type: "string",
    default: permissionMode,
  });

  function persistPermissionMode() {
    pi.appendEntry<PermissionState>(PERMISSION_STATE_TYPE, {
      mode: permissionMode,
    });
  }

  function setPermissionMode(
    mode: PermissionMode,
    notify?: (message: string) => void,
  ) {
    permissionMode = mode;
    persistPermissionMode();
    notify?.(
      mode === "yolo"
        ? "YOLO mode enabled. Bunny safety gates are disabled for this session."
        : "Safe mode enabled. Bunny safety gates are active.",
    );
  }

  function permissionStatus(): string {
    return permissionMode === "yolo"
      ? "Permission mode: yolo. Bunny safety gates are disabled."
      : "Permission mode: safe. Bunny safety gates are active.";
  }

  pi.registerCommand("yolo", {
    description: "Toggle Bunny safety gates: /yolo true|false|status",
    handler: async (args, ctx) => {
      const requested = normalizePermissionMode(args || "status");
      if (!requested) {
        ctx.ui.notify("Usage: /yolo true|false|status", "warning");
        return;
      }
      if ((args || "").trim().toLowerCase() === "status") {
        ctx.ui.notify(permissionStatus(), "info");
        return;
      }
      setPermissionMode(requested, (message) => ctx.ui.notify(message, "info"));
    },
  });

  pi.registerCommand("permissions", {
    description: "Set Bunny permission mode: /permissions safe|yolo|status",
    handler: async (args, ctx) => {
      const raw = args.trim().toLowerCase();
      if (!raw || raw === "status") {
        ctx.ui.notify(permissionStatus(), "info");
        return;
      }
      const requested = normalizePermissionMode(raw);
      if (!requested) {
        ctx.ui.notify("Usage: /permissions safe|yolo|status", "warning");
        return;
      }
      setPermissionMode(requested, (message) => ctx.ui.notify(message, "info"));
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const flagMode = normalizePermissionMode(pi.getFlag("permission"));
    if (flagMode) {
      permissionMode = flagMode;
    }

    const savedState = ctx.sessionManager
      .getEntries()
      .filter(
        (entry: { type: string; customType?: string }) =>
          entry.type === "custom" && entry.customType === PERMISSION_STATE_TYPE,
      )
      .pop() as { data?: PermissionState } | undefined;

    if (savedState?.data?.mode && !flagMode) {
      permissionMode = savedState.data.mode;
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    if (permissionMode === "yolo") return undefined;

    if (event.toolName === "write" || event.toolName === "edit") {
      const path = getPathInput(event.input as Record<string, unknown>);
      if (path && isProtectedPath(path)) {
        if (ctx.hasUI) {
          ctx.ui.notify(`Blocked write to protected path: ${path}`, "warning");
        }
        return {
          block: true,
          reason: `Path "${path}" is protected by Bunny safe mode.`,
        };
      }
    }

    if (event.toolName !== "bash") return undefined;

    const command = (event.input as Record<string, unknown>).command;
    if (typeof command !== "string" || !isDangerousBash(command)) {
      return undefined;
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason:
          "Dangerous command blocked by Bunny safe mode because no UI is available for confirmation.",
      };
    }

    const allowed = await ctx.ui.confirm(
      "Allow Dangerous Command?",
      `Bunny safe mode flagged this command:\n\n${command}`,
    );
    if (!allowed) {
      return {
        block: true,
        reason: "Dangerous command blocked by Bunny safe mode.",
      };
    }

    return undefined;
  });

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
