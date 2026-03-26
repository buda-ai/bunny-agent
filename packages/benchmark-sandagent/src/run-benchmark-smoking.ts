/**
 * Smoking benchmark: `cli` (local `sandagent run`) or `daemon` (Sandock sandbox +
 * in-sandbox `sandagent-daemon`, same idea as web `/api/ai` + `create-sandbox.ts`).
 *
 * `daemon` always uses Sandock — there is no host `fetch` to localhost:3080.
 * POST `env` matches SDK: `sandbox.getEnv()` merged into the coding-run JSON.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  evaluateAnswer,
  getAllSmokingTests,
  type SmokingTask,
} from "@sandagent/benchmark-shared";
import {
  buildRunnerEnv,
  isSandagentDaemonHealthy,
  type RunnerType,
  type SandAgentCodingRunBody,
  type SandboxAdapter,
  type SandboxHandle,
  streamCodingRunFromSandbox,
} from "@sandagent/manager";
import { getRunner } from "./runners/index.js";
import type { BenchmarkResult, SandAgentRunner } from "./types.js";

export type BenchmarkTransport = "cli" | "daemon";

export interface SmokingRunOptions {
  runner: SandAgentRunner;
  verbose?: boolean;
  transport?: BenchmarkTransport;
  /** In-sandbox daemon base URL (default `http://127.0.0.1:3080`, same as SDK). */
  daemonUrl?: string;
}

/** Same as `DEFAULT_SANDAGENT_DAEMON_URL` in SDK (in-container daemon). */
const DEFAULT_IN_SANDBOX_DAEMON_URL = "http://127.0.0.1:3080";

function normalizeDaemonBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * Same credential shape as `buildSandbox` → `baseEnv` in
 * `apps/web/lib/example/create-sandbox.ts` (explicit keys, not only `inherit`).
 */
function runnerEnvLikeWebCreateSandbox(
  runner: SandAgentRunner,
): Record<string, string> {
  const e = process.env;
  return buildRunnerEnv({
    runnerType: runner as RunnerType,
    ANTHROPIC_API_KEY: e.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: e.ANTHROPIC_BASE_URL,
    AWS_BEARER_TOKEN_BEDROCK: e.AWS_BEARER_TOKEN_BEDROCK,
    ANTHROPIC_AUTH_TOKEN: e.ANTHROPIC_AUTH_TOKEN,
    LITELLM_MASTER_KEY: e.LITELLM_MASTER_KEY,
    ANTHROPIC_BEDROCK_BASE_URL: e.ANTHROPIC_BEDROCK_BASE_URL,
    CLAUDE_CODE_USE_BEDROCK: e.CLAUDE_CODE_USE_BEDROCK,
    CLAUDE_CODE_SKIP_BEDROCK_AUTH: e.CLAUDE_CODE_SKIP_BEDROCK_AUTH,
    OPENAI_API_KEY: e.OPENAI_API_KEY,
    OPENAI_BASE_URL: e.OPENAI_BASE_URL,
    GEMINI_API_KEY: e.GEMINI_API_KEY,
    GEMINI_BASE_URL: e.GEMINI_BASE_URL,
    inherit: {},
  });
}

function sandockImageNeedsSandagentEntrypoint(image: string): boolean {
  const i = image.toLowerCase();
  return (
    i.includes("vikadata/sandagent") ||
    i.includes("/sandagent:") ||
    i.endsWith("/sandagent") ||
    i === "sandagent"
  );
}

async function createSandockLikeWeb(runner: SandAgentRunner) {
  const { SandockSandbox } = await import("@sandagent/sandbox-sandock");
  const image = process.env.SANDBOX_IMAGE ?? "vikadata/sandagent:0.9.9-beta.2";
  const entry =
    process.env.SANDOCK_SANDAGENT_ENTRYPOINT?.trim() ||
    "/usr/local/bin/sandagent-entrypoint";
  const sleepArg = process.env.SANDOCK_CONTAINER_SLEEP_SEC ?? "infinity";

  return new SandockSandbox({
    apiKey: process.env.SANDOCK_API_KEY,
    image,
    skipBootstrap: true,
    volumes: [
      { volumeName: "sandagent-benchmark-smoking", volumeMountPath: "/agent" },
    ],
    env: runnerEnvLikeWebCreateSandbox(runner),
    workdir: "/agent",
    name: "sandagent-benchmark-smoking",
    ...(sandockImageNeedsSandagentEntrypoint(image)
      ? { command: [entry, "sleep", sleepArg] }
      : {}),
  });
}

async function collectUtf8(
  iterable: AsyncIterable<Uint8Array>,
): Promise<string> {
  const decoder = new TextDecoder();
  let out = "";
  for await (const chunk of iterable) {
    out += decoder.decode(chunk, { stream: true });
  }
  out += decoder.decode();
  return out;
}

function buildInSandboxCodingRunBody(
  runner: SandAgentRunner,
  test: SmokingTask,
  cwd: string,
  sandboxAdapter: SandboxAdapter,
): SandAgentCodingRunBody {
  const model = process.env.AI_MODEL;
  const body: SandAgentCodingRunBody = {
    userInput: test.description,
    runner,
    cwd,
  };
  if (model) body.model = model;

  const sandboxEnv = sandboxAdapter.getEnv?.() ?? {};
  const runnerEnv = { ...sandboxEnv };
  if (Object.keys(runnerEnv).length > 0) {
    body.env = runnerEnv;
  }
  return body;
}

export async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  logFile: string,
  log: (m: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const workDir = "/tmp/sandagent-benchmark";
    mkdirSync(workDir, { recursive: true });

    log(`Starting command: ${command} ${args.join(" ")}`);
    log(`Working directory: ${workDir}`);
    log(`Timeout: ${timeoutMs}ms`);

    const proc = spawn(command, args, {
      cwd: workDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      log(`Command timeout after ${timeoutMs}ms, killing process`);
      proc.kill();
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout?.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      writeFileSync(logFile, text, { flag: "a" });
      process.stdout.write(text);
    });

    proc.stderr?.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      writeFileSync(logFile, `[STDERR] ${text}`, { flag: "a" });
      process.stderr.write(text);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      log(`Command exited with code ${code}`);
      log(`Output length: ${stdout.length + stderr.length} bytes`);
      if (code === 0) {
        resolve(stdout + stderr);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on("error", (error) => {
      clearTimeout(timeout);
      log(`Command error: ${error.message}`);
      reject(error);
    });
  });
}

async function runSmokingTestOutput(
  options: SmokingRunOptions & { transport: BenchmarkTransport },
  test: SmokingTask,
  ctx: {
    runnerHandler: ReturnType<typeof getRunner>;
    sandockHandle: SandboxHandle | null;
    sandockAdapter: SandboxAdapter | null;
    daemonBase: string;
    log: (m: string) => void;
    logFile: string;
  },
): Promise<string> {
  const transport = options.transport;

  if (transport === "cli") {
    const cmd = ctx.runnerHandler.buildCommand(test);
    if (options.verbose) {
      console.log(`   Command: ${cmd.command} ${cmd.args.join(" ")}`);
    }
    return await runCommand(
      cmd.command,
      cmd.args,
      test.timeoutMs,
      ctx.logFile,
      ctx.log,
    );
  }

  if (transport === "daemon") {
    if (!ctx.sandockHandle || !ctx.sandockAdapter) {
      throw new Error("daemon transport requires Sandock (attached sandbox)");
    }
    const cwd = ctx.sandockHandle.getWorkdir();
    const body = buildInSandboxCodingRunBody(
      options.runner,
      test,
      cwd,
      ctx.sandockAdapter,
    );
    return await collectUtf8(
      streamCodingRunFromSandbox(ctx.sandockHandle, ctx.daemonBase, body, {
        timeout: test.timeoutMs,
        cwd,
      }),
    );
  }

  const _exhaustive: never = transport;
  throw new Error(`Unexpected transport: ${_exhaustive}`);
}

export async function executeSmokingBenchmark(
  options: SmokingRunOptions,
  hooks: {
    log: (message: string) => void;
    logFile: string;
    onTransportBanner: (lines: string[]) => void;
    onResult: (result: BenchmarkResult) => void;
  },
): Promise<void> {
  const transport: BenchmarkTransport = options.transport ?? "cli";
  const runnerHandler = getRunner(options.runner);
  const tests = getAllSmokingTests();

  const daemonBase =
    options.daemonUrl ??
    process.env.SANDAGENT_DAEMON_URL ?? process.env.DAEMON_URL ??
    DEFAULT_IN_SANDBOX_DAEMON_URL;

  let sandockHandle: SandboxHandle | null = null;
  let sandockAdapter: SandboxAdapter | null = null;

  if (transport === "daemon") {
    sandockAdapter = await createSandockLikeWeb(options.runner);
    sandockHandle = await sandockAdapter.attach();
    const healthy = await isSandagentDaemonHealthy(sandockHandle, daemonBase);
    if (!healthy) {
      await sandockHandle.destroy().catch(() => {});
      throw new Error(
        `sandagent-daemon not reachable at ${daemonBase}/healthz inside Sandock sandbox (curl must return 200).`,
      );
    }
  }

  hooks.onTransportBanner([
    `\n🏖️  Smoking benchmark — transport: ${transport}`,
    ...(transport === "cli"
      ? [`   sandagent --runner ${options.runner}`]
      : [
          `   Sandock + in-sandbox daemon (like /api/ai): curl → ${normalizeDaemonBaseUrl(daemonBase)}/api/coding/run`,
        ]),
    `📊 Total tests: ${tests.length}\n`,
  ]);

  const ctx = {
    runnerHandler,
    sandockHandle,
    sandockAdapter,
    daemonBase,
    log: hooks.log,
    logFile: hooks.logFile,
  };

  try {
    const fullOpts = { ...options, transport };

    for (const test of tests) {
      const startTime = Date.now();
      hooks.log(`\n=== Starting test: ${test.id} - ${test.name} ===`);
      console.log(`🧪 [${test.id}] ${test.name} (${test.category})`);

      try {
        const output = await runSmokingTestOutput(fullOpts, test, ctx);

        if (options.verbose) {
          console.log(`   Raw output length: ${output.length}`);
        }

        const answer = runnerHandler.extractAnswer(output);
        if (options.verbose) {
          console.log(`   Extracted: "${answer.substring(0, 120)}..."`);
        }
        hooks.log(`Extracted answer: ${answer.substring(0, 200)}`);

        const success = evaluateAnswer(answer, test.expectedOutput);
        const result: BenchmarkResult = {
          taskId: test.id,
          success,
          answer,
          expectedAnswer: test.expectedOutput,
          rawOutput: output,
          durationMs: Date.now() - startTime,
        };
        hooks.onResult(result);

        if (success) {
          console.log(`   ✅ PASS (${result.durationMs}ms)`);
        } else {
          console.log(`   ❌ FAIL (${result.durationMs}ms)`);
          console.log(`   Expected: ${test.expectedOutput}`);
          console.log(`   Got: ${answer}`);
        }

        if (options.verbose && output) {
          console.log(`   Output preview: ${output.substring(0, 120)}...`);
        }
      } catch (error) {
        const result: BenchmarkResult = {
          taskId: test.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime,
        };
        hooks.onResult(result);
        console.log(`   ❌ ERROR: ${result.error}`);
      }

      console.log();
    }
  } finally {
    if (sandockHandle) {
      await sandockHandle.destroy().catch(() => {});
    }
  }
}
