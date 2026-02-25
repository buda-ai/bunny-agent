import path from "node:path";
import type { DaytonaSandboxOptions } from "@sandagent/sandbox-daytona";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { SandockSandbox } from "@sandagent/sandbox-sandock";
import { LocalSandbox, type SandboxAdapter, buildRunnerEnv } from "@sandagent/sdk";

const MONOREPO_ROOT = path.resolve(process.cwd(), "../..");
const TEMPLATES_PATH = path.join(MONOREPO_ROOT, "templates");
const RUNNER_BUNDLE_PATH = path.join(
  MONOREPO_ROOT,
  "apps/runner-cli/dist/bundle.mjs",
);
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? "vikadata/sandagent:0.2.15";

export interface CreateSandboxParams {
  SANDBOX_PROVIDER?: string;
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
  AWS_REGION?: string;
  template?: string;
  SANDBOX_IMAGE?: string;
  env?: Record<string, string>;
  localWorkdir?: string;
}

// --- Server-side sandbox ID cache (30 min TTL) ------------------------------
const SANDBOX_ID_TTL_MS = 30 * 60 * 1000;
const sandboxIdCache = new Map<string, { id: string; expiresAt: number }>();

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
  const key = `sandagent-${params.template ?? "default"}`;
  sandboxIdCache.delete(key);
}

/** Build sandbox and attach. */
export async function getOrCreateSandbox(
  params: CreateSandboxParams,
): Promise<SandboxAdapter> {
  const sandbox = await buildSandbox(params);
  await sandbox.attach();

  // Cache the sandboxId after successful attach
  const sandboxId = sandbox.getHandle?.()?.getSandboxId?.();
  if (sandboxId) {
    const key = `sandagent-${params.template ?? "default"}`;
    setCachedSandboxId(key, sandboxId);
  }

  return sandbox;
}

async function buildSandbox(
  params: CreateSandboxParams,
): Promise<SandboxAdapter> {
  const {
    SANDBOX_PROVIDER = "e2b",
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
    template = "default",
    env: extraEnv = {},
  } = params;

  const sandboxName = `sandagent-${template}`;
  const baseEnv = buildRunnerEnv({
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    AWS_BEARER_TOKEN_BEDROCK,
    ANTHROPIC_AUTH_TOKEN,
    LITELLM_MASTER_KEY,
    ANTHROPIC_BEDROCK_BASE_URL,
    CLAUDE_CODE_USE_BEDROCK,
    CLAUDE_CODE_SKIP_BEDROCK_AUTH,
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
    const cacheKey = sandboxName;
    const cachedId = getCachedSandboxId(cacheKey);
    return new SandockSandbox({
      apiKey: SANDOCK_API_KEY,
      image: params.SANDBOX_IMAGE ?? SANDBOX_IMAGE,
      skipBootstrap: true,
      templatesPath: path.join(TEMPLATES_PATH, template),
      volumes: [
        { volumeName: sandboxName, volumeMountPath: "/workspace" },
        {
          volumeName: `${sandboxName}-claude-session`,
          volumeMountPath: "/root/.claude",
        },
      ],
      env: baseEnv,
      workdir: "/workspace",
      name: sandboxName,
      sandboxId: cachedId,
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
