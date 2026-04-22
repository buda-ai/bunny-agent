import { createHash } from "node:crypto";
import path from "node:path";
import type { DaytonaSandboxOptions } from "@bunny-agent/sandbox-daytona";
import { E2BSandbox } from "@bunny-agent/sandbox-e2b";
import { SandockSandbox } from "@bunny-agent/sandbox-sandock";
import {
  buildRunnerEnv,
  LocalSandbox,
  type SandboxAdapter,
} from "@bunny-agent/sdk";
import type { RunnerType } from "@/lib/runner";

const MONOREPO_ROOT = path.resolve(process.cwd(), "../..");
const TEMPLATES_PATH = path.join(MONOREPO_ROOT, "templates");
const RUNNER_BUNDLE_PATH = path.join(
  MONOREPO_ROOT,
  "apps/runner-cli/dist/bundle.mjs",
);
const SANDBOX_IMAGE =
  process.env.SANDBOX_IMAGE ?? "vikadata/bunny-agent:0.9.16-beta.3";

/**
 * Sandock on Kubernetes replaces Docker ENTRYPOINT with a shell keep-alive, so
 * we pass the image entrypoint explicitly. Args mirror Dockerfile:
 * ENTRYPOINT (image-specific) + CMD ["sleep", "infinity"].
 * Set SANDOCK_CONTAINER_SLEEP_SEC=1800 (or another duration) if you need a
 * numeric `sleep` instead of `infinity`.
 * Override the entrypoint binary with SANDOCK_BUNNY_AGENT_ENTRYPOINT if your image
 * installs it elsewhere.
 *
 * LLM keys in `SandockSandbox({ env: baseEnv })` are sent to the Sandock API as
 * container `env` so bunny-agent-daemon sees the same variables as shell `exec`
 * (not only the curl child process).
 *
 * Sandock + bunny-agent image: the entrypoint command is always applied when the
 * image name matches {@link sandockImageNeedsSandagentEntrypoint}. `useBunnyAgentDaemon`
 * only affects sandbox cache key and (in the web app) whether `/api/ai` probes
 * `/healthz` and passes `daemonUrl` for HTTP transport, or omits it for CLI.
 */
const SANDOCK_SLEEP_ARG = process.env.SANDOCK_CONTAINER_SLEEP_SEC ?? "infinity";

function resolveSandockEntrypoint(image: string): string {
  const overridden = process.env.SANDOCK_BUNNY_AGENT_ENTRYPOINT?.trim();
  if (overridden) return overridden;

  const i = image.toLowerCase();
  // New image naming uses sandagent; keep entrypoint name aligned across images.
  if (
    i.includes("vikadata/sandagent") ||
    i.includes("/sandagent:") ||
    i.endsWith("/sandagent") ||
    i === "sandagent"
  ) {
    return "/usr/local/bin/sandagent-entrypoint";
  }

  // Legacy bunny-agent images use bunny-agent entrypoint.
  return "/usr/local/bin/bunny-agent-entrypoint";
}

function sandockImageNeedsSandagentEntrypoint(image: string): boolean {
  const i = image.toLowerCase();
  return (
    i.includes("vikadata/bunny-agent") ||
    i.includes("vikadata/sandagent") ||
    i.includes("/bunny-agent:") ||
    i.includes("/sandagent:") ||
    i.endsWith("/bunny-agent") ||
    i.endsWith("/sandagent") ||
    i === "bunny-agent" ||
    i === "sandagent"
  );
}

export interface CreateSandboxParams {
  SANDBOX_PROVIDER?: string;
  /** Runner type for buildRunnerEnv (e.g. pi needs ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL mapping). */
  runnerType?: RunnerType;
  E2B_API_KEY?: string;
  SANDOCK_API_KEY?: string;
  SANDOCK_BASE_URL?: string;
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
   * Entrypoint command for bunny-agent images is chosen from the image name, not this flag.
   */
  useBunnyAgentDaemon?: boolean;
}

// --- Server-side sandbox ID cache (30 min TTL) ------------------------------
const SANDBOX_ID_TTL_MS = 30 * 60 * 1000;
const sandboxIdCache = new Map<string, { id: string; expiresAt: number }>();

function sandboxCacheKey(params: CreateSandboxParams): string {
  const t = params.template ?? "default";
  const daemon = params.useBunnyAgentDaemon ? "-daemon" : "";
  // Sandock sandboxes are cached by sandboxId for performance.
  // If runtime env changes (e.g. AGENT_KEY / BUDA_API_URL), we MUST include
  // an env fingerprint in the cache key; otherwise the old container keeps
  // running with stale environment.
  const env = params.env ?? {};
  const fingerprintSource = {
    sandboxProvider: params.SANDBOX_PROVIDER ?? "",
    runnerType: params.runnerType ?? "",
    // Only include variables that can influence skill execution.
    AGENT_KEY: env.AGENT_KEY ?? "",
    BUDA_API_URL: env.BUDA_API_URL ?? "",
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(fingerprintSource))
    .digest("hex")
    .slice(0, 12);

  return `bunny-agent-${t}${daemon}-${fingerprint}`;
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
    SANDOCK_BASE_URL,
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

  const sandboxName = `bunny-agent-${template}`;
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
    const { DaytonaSandbox } = await import("@bunny-agent/sandbox-daytona");
    const opts: DaytonaSandboxOptions & { snapshot?: string } = {
      apiKey: DAYTONA_API_KEY,
      templatesPath: path.join(TEMPLATES_PATH, template),
      volumeName: sandboxName,
      volumeMountPath: "/workspace",
      name: sandboxName,
      autoStopInterval: 15,
      autoDeleteInterval: -1,
      env: baseEnv,
      snapshot: "bunny-agent-claude-researcher:0.1.2",
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
      ...(SANDOCK_BASE_URL ? { baseUrl: SANDOCK_BASE_URL } : {}),
      image,
      skipBootstrap: true,
      templatesPath: path.join(TEMPLATES_PATH, template),
      volumes: [{ volumeName: sandboxName, volumeMountPath: "/agent" }],
      env: baseEnv,
      workdir: "/agent",
      name: sandboxName,
      sandboxId: cachedId,
      ...(sandockImageNeedsSandagentEntrypoint(image)
        ? {
            command: [
              resolveSandockEntrypoint(image),
              "sleep",
              SANDOCK_SLEEP_ARG,
            ],
          }
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
