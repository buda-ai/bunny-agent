import path from "node:path";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { SandockSandbox } from "@sandagent/sandbox-sandock";
import { LocalSandbox, type SandboxAdapter } from "@sandagent/sdk";

const MONOREPO_ROOT = path.resolve(process.cwd(), "../..");
const TEMPLATES_PATH = path.join(MONOREPO_ROOT, "templates");
const RUNNER_BUNDLE_PATH = path.join(
  MONOREPO_ROOT,
  "apps/runner-cli/dist/bundle.mjs",
);
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? "vikadata/sandagent:0.1.4";

export interface CreateSandboxParams {
  SANDBOX_PROVIDER?: string;
  E2B_API_KEY?: string;
  SANDOCK_API_KEY?: string;
  DAYTONA_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  template?: string;
  SANDBOX_IMAGE?: string;
  env?: Record<string, string>;
  localWorkdir?: string;
}

/** Use globalThis so the cache is shared across all API routes in the same Node process. */
const g = globalThis as typeof globalThis & {
  __sandagentSandboxCache?: Map<string, { sandbox: SandboxAdapter }>;
};
if (!g.__sandagentSandboxCache) g.__sandagentSandboxCache = new Map();
const sandboxCache = g.__sandagentSandboxCache;

function cacheKey(params: CreateSandboxParams): string {
  const template = params.template ?? "default";
  return `sandagent-${template}`;
}

export function evictSandbox(params: CreateSandboxParams): void {
  const key = cacheKey(params);
  if (sandboxCache.delete(key)) {
    console.log(`[SandboxCache] Evicted sandbox "${key}"`);
  }
}

/** Get or create sandbox. Answer is only sent after the AI stream has shown AskUserQuestion, so the sandbox is always attached by then. */
export async function getOrCreateSandbox(
  params: CreateSandboxParams,
): Promise<SandboxAdapter> {
  const key = cacheKey(params);
  const existing = sandboxCache.get(key);
  if (existing) {
    console.log(`[SandboxCache] Reusing sandbox "${key}"`);
    return existing.sandbox;
  }

  const sandbox = await buildSandbox(params);
  await sandbox.attach();
  sandboxCache.set(key, { sandbox });
  console.log(`[SandboxCache] Created sandbox "${key}"`);
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
    template = "default",
    env: extraEnv = {},
  } = params;

  const sandboxName = `sandagent-${template}`;
  const baseEnv: Record<string, string> = {
    DEBUG_STREAM: "true",
    ...extraEnv,
  };
  if (ANTHROPIC_API_KEY) baseEnv.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
  if (ANTHROPIC_BASE_URL) baseEnv.ANTHROPIC_BASE_URL = ANTHROPIC_BASE_URL;

  if (SANDBOX_PROVIDER === "daytona" && DAYTONA_API_KEY) {
    const { DaytonaSandbox } = await import("@sandagent/sandbox-daytona");
    return new DaytonaSandbox({
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
    });
  }

  if (SANDBOX_PROVIDER === "sandock" && SANDOCK_API_KEY) {
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
    });
  }

  if (SANDBOX_PROVIDER === "e2b" && E2B_API_KEY) {
    return new E2BSandbox({
      apiKey: E2B_API_KEY,
      templatesPath: path.join(TEMPLATES_PATH, template),
      name: sandboxName,
      env: {
        ...baseEnv,
        DEBUG: "true",
        API_TIMEOUT_MS: "3000000",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.5-air",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-4.7",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-4.7",
      },
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
      API_TIMEOUT_MS: "3000000",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.5-air",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-4.7",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-4.7",
    },
    runnerCommand: ["node", RUNNER_BUNDLE_PATH, "run"],
  });
}
