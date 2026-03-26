import path from "node:path";
import type { DaytonaSandboxOptions } from "@sandagent/sandbox-daytona";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { SandockSandbox } from "@sandagent/sandbox-sandock";
import {
  buildRunnerEnv,
  LocalSandbox,
  type SandboxAdapter,
} from "@sandagent/sdk";
import type { RunnerType } from "@/lib/runner";

const MONOREPO_ROOT = path.resolve(process.cwd(), "../..");
const TEMPLATES_PATH = path.join(MONOREPO_ROOT, "templates");
const RUNNER_BUNDLE_PATH = path.join(
  MONOREPO_ROOT,
  "apps/runner-cli/dist/bundle.mjs",
);
const SANDBOX_IMAGE =
  process.env.SANDBOX_IMAGE ?? "vikadata/sandagent:0.9.9-beta.2";

/**
 * Sandock on Kubernetes replaces Docker ENTRYPOINT with a shell keep-alive, so
 * we pass the image entrypoint explicitly. Args mirror Dockerfile:
 * ENTRYPOINT sandagent-entrypoint + CMD ["sleep", "infinity"].
 * Set SANDOCK_CONTAINER_SLEEP_SEC=1800 (or another duration) if you need a
 * numeric `sleep` instead of `infinity`.
 * Override the entrypoint binary with SANDOCK_SANDAGENT_ENTRYPOINT if your image
 * installs it elsewhere.
 *
 * LLM keys in `SandockSandbox({ env: baseEnv })` are sent to the Sandock API as
 * container `env` so sandagent-daemon sees the same variables as shell `exec`
 * (not only the curl child process).
 *
 * Sandock + sandagent image: the entrypoint command is always applied when the
 * image name matches {@link sandockImageNeedsSandagentEntrypoint}. `useSandagentDaemon`
 * only affects sandbox cache key and (in the web app) whether `/api/ai` probes
 * `/healthz` and passes `daemonUrl` for HTTP transport, or omits it for CLI.
 */
const SANDOCK_SLEEP_ARG = process.env.SANDOCK_CONTAINER_SLEEP_SEC ?? "infinity";

const SANDAGENT_SANDOCK_ENTRYPOINT =
  process.env.SANDOCK_SANDAGENT_ENTRYPOINT?.trim() ||
  "/usr/local/bin/sandagent-entrypoint";

const SANDAGENT_SANDOCK_COMMAND = [
  SANDAGENT_SANDOCK_ENTRYPOINT,
  "sleep",
  SANDOCK_SLEEP_ARG,
] as const;

function sandockImageNeedsSandagentEntrypoint(image: string): boolean {
  const i = image.toLowerCase();
  return (
    i.includes("vikadata/sandagent") ||
    i.includes("/sandagent:") ||
    i.endsWith("/sandagent") ||
    i === "sandagent"
  );
}

export interface CreateSandboxParams {
  SANDBOX_PROVIDER?: string;
  /** Runner type for buildRunnerEnv (e.g. pi needs ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL mapping). */
  runnerType?: RunnerType;
  E2B_API_KEY?: string;
  SANDOCK_API_KEY?: string;
  DAYTONA_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  AWS_BEARER_TOKEN_BEDROCK?: string;
  /** Bedrock proxy: API key (same as LITELLM_MASTER_KEY) */
  ANTHROPIC_AUTH_TOKEN?: string;
  LITELLM_MASTER_KEY?: string;
  ANTHROPIC_BEDROCK_BASE_URL?: string;
  CLAUDE_CODE_USE_BEDROCK?: string;
  CLAUDE_CODE_SKIP_BEDROCK_AUTH?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string;
  AWS_REGION?: string;
  template?: string;
  SANDBOX_IMAGE?: string;
  env?: Record<string, string>;
  localWorkdir?: string;
  /**
   * Sandock: include in sandbox cache key; web API also uses this to pass provider `daemonUrl`.
   * Entrypoint command for sandagent images is chosen from the image name, not this flag.
   */
  useSandagentDaemon?: boolean;
}

// --- Server-side sandbox ID cache (30 min TTL) ------------------------------
const SANDBOX_ID_TTL_MS = 30 * 60 * 1000;
const sandboxIdCache = new Map<string, { id: string; expiresAt: number }>();

function sandboxCacheKey(params: CreateSandboxParams): string {
  const t = params.template ?? "default";
  const daemon = params.useSandagentDaemon ? "-daemon" : "";
  return `sandagent-${t}${daemon}`;
}

function getCachedSandboxId(key: string): string | undefined {
  const entry = sandboxIdCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    sandboxIdCache.delete(key);
    return undefined;
  }
  return entry.id;
}

function setCachedSandboxId(key: string, id: string): void {
  sandboxIdCache.set(key, { id, expiresAt: Date.now() + SANDBOX_ID_TTL_MS });
}

export function evictSandbox(params: CreateSandboxParams): void {
  sandboxIdCache.delete(sandboxCacheKey(params));
}

/** Build sandbox and attach. */
export async function getOrCreateSandbox(
  params: CreateSandboxParams,
): Promise<SandboxAdapter> {
  const sandbox = await buildSandbox(params);
  await sandbox.attach();

  const sandboxId = sandbox.getHandle?.()?.getSandboxId?.();
  if (sandboxId) {
    setCachedSandboxId(sandboxCacheKey(params), sandboxId);
  }

  return sandbox;
}

async function buildSandbox(
  params: CreateSandboxParams,
): Promise<SandboxAdapter> {
  const {
    SANDBOX_PROVIDER = "e2b",
    runnerType,
    E2B_API_KEY,
    SANDOCK_API_KEY,
    DAYTONA_API_KEY,
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    AWS_BEARER_TOKEN_BEDROCK,
    ANTHROPIC_AUTH_TOKEN,
    LITELLM_MASTER_KEY,
    ANTHROPIC_BEDROCK_BASE_URL,
    CLAUDE_CODE_USE_BEDROCK,
    CLAUDE_CODE_SKIP_BEDROCK_AUTH,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    template = "default",
    env: extraEnv = {},
  } = params;

  const sandboxName = `sandagent-${template}`;
  const baseEnv = buildRunnerEnv({
    runnerType,
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    AWS_BEARER_TOKEN_BEDROCK,
    ANTHROPIC_AUTH_TOKEN,
    LITELLM_MASTER_KEY,
    ANTHROPIC_BEDROCK_BASE_URL,
    CLAUDE_CODE_USE_BEDROCK,
    CLAUDE_CODE_SKIP_BEDROCK_AUTH,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    inherit: extraEnv,
  });
  if (SANDBOX_PROVIDER === "daytona" && DAYTONA_API_KEY) {
    const { DaytonaSandbox } = await import("@sandagent/sandbox-daytona");
    const opts: DaytonaSandboxOptions & { snapshot?: string } = {
      apiKey: DAYTONA_API_KEY,
      templatesPath: path.join(TEMPLATES_PATH, template),
      volumeName: sandboxName,
      volumeMountPath: "/workspace",
      name: sandboxName,
      autoStopInterval: 15,
      autoDeleteInterval: -1,
      env: baseEnv,
      snapshot: "sandagent-claude-researcher:0.1.2",
      workdir: "/workspace",
    };
    return new DaytonaSandbox(opts) as unknown as SandboxAdapter;
  }

  if (SANDBOX_PROVIDER === "sandock" && SANDOCK_API_KEY) {
    const cacheKey = sandboxCacheKey(params);
    const cachedId = getCachedSandboxId(cacheKey);
    const image = params.SANDBOX_IMAGE ?? SANDBOX_IMAGE;
    return new SandockSandbox({
      apiKey: SANDOCK_API_KEY,
      image,
      skipBootstrap: true,
      // templatesPath: path.join(TEMPLATES_PATH, template),
      volumes: [{ volumeName: sandboxName, volumeMountPath: "/agent" }],
      env: baseEnv,
      workdir: "/agent",
      name: sandboxName,
      sandboxId: cachedId,
      ...(sandockImageNeedsSandagentEntrypoint(image)
        ? { command: [...SANDAGENT_SANDOCK_COMMAND] }
        : {}),
    });
  }

  if (SANDBOX_PROVIDER === "e2b" && E2B_API_KEY) {
    return new E2BSandbox({
      apiKey: E2B_API_KEY,
      templatesPath: path.join(TEMPLATES_PATH, template),
      name: sandboxName,
      env: baseEnv,
      workdir: "/workspace",
    });
  }

  const localWorkdir =
    params.localWorkdir ?? path.join(process.cwd(), "workspace");
  return new LocalSandbox({
    workdir: localWorkdir,
    templatesPath: path.join(TEMPLATES_PATH, template),
    env: {
      ...baseEnv,
      DEBUG: "true",
      API_TIMEOUT_MS: "3000",
    },
    runnerCommand: ["node", RUNNER_BUNDLE_PATH, "run"],
  });
}
