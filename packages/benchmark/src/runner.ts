/**
 * Agent CLI Runners
 *
 * Executes benchmark tasks using various agent CLIs:
 * - sandagent: SandAgent CLI
 * - gemini-cli: Google Gemini CLI
 * - claudecode: Anthropic Claude Code CLI
 * - codex-cli: OpenAI Codex CLI
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentRunner,
  BenchmarkResult,
  GaiaLevel,
  GaiaTask,
  RunnerConfig,
} from "./types.js";

/**
 * Default configurations for each runner
 */
const DEFAULT_RUNNER_CONFIGS: Record<AgentRunner, Partial<RunnerConfig>> = {
  sandagent: {
    command: "sandagent",
    args: ["run", "--"],
    timeout: 300000, // 5 minutes
  },
  "gemini-cli": {
    command: "gemini",
    args: [],
    timeout: 300000,
  },
  claudecode: {
    command: "claude",
    args: [],
    timeout: 300000,
  },
  "codex-cli": {
    command: "codex",
    args: [],
    timeout: 300000,
  },
};

/**
 * Build the command arguments for a specific runner
 */
function buildRunnerCommand(
  runner: AgentRunner,
  task: GaiaTask,
  config: RunnerConfig,
): { command: string; args: string[] } {
  const baseCommand = config.command ?? DEFAULT_RUNNER_CONFIGS[runner].command!;
  const baseArgs = config.args ?? DEFAULT_RUNNER_CONFIGS[runner].args ?? [];

  // Build prompt with file context if present
  let prompt = task.question;
  if (task.files && task.files.length > 0) {
    const fileInfo = task.files
      .map((f) => `[Attached file: ${f.name} at ${f.path}]`)
      .join("\n");
    prompt = `${fileInfo}\n\n${task.question}`;
  }

  switch (runner) {
    case "sandagent":
      return {
        command: baseCommand,
        args: [...baseArgs, prompt],
      };

    case "gemini-cli":
      // Gemini CLI format: gemini "prompt"
      return {
        command: baseCommand,
        args: [...baseArgs, prompt],
      };

    case "claudecode":
      // Claude Code format: claude --print "prompt"
      return {
        command: baseCommand,
        args: ["--print", ...baseArgs, prompt],
      };

    case "codex-cli":
      // Codex CLI format: codex "prompt"
      return {
        command: baseCommand,
        args: [...baseArgs, prompt],
      };

    default:
      throw new Error(`Unknown runner: ${runner}`);
  }
}

/**
 * Execute a command and capture output
 */
function executeCommand(
  command: string,
  args: string[],
  options: {
    env?: Record<string, string>;
    cwd?: string;
    timeout?: number;
  } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: { ...process.env, ...options.env },
      cwd: options.cwd,
      timeout: options.timeout,
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0,
      });
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Normalize answer for comparison
 */
export function normalizeAnswer(answer: string): string {
  return answer
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

/**
 * Check if an answer is correct
 */
export function checkAnswer(
  agentAnswer: string,
  expectedAnswer: string,
): boolean {
  const normalizedAgent = normalizeAnswer(agentAnswer);
  const normalizedExpected = normalizeAnswer(expectedAnswer);

  // Empty agent answer is always incorrect
  if (normalizedAgent.length === 0) {
    return false;
  }

  // Exact match
  if (normalizedAgent === normalizedExpected) {
    return true;
  }

  // Contains match (agent answer contains expected, or vice versa)
  if (
    normalizedAgent.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedAgent)
  ) {
    return true;
  }

  return false;
}

/**
 * Extract the final answer from agent output
 * Agents often include explanation before the answer
 */
function extractFinalAnswer(output: string): string {
  // Look for common answer patterns
  const patterns = [
    /(?:final answer|answer)[:\s]+(.+?)(?:\n|$)/i,
    /(?:the answer is)[:\s]+(.+?)(?:\n|$)/i,
    /(?:result)[:\s]+(.+?)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // If no pattern found, return the last non-empty line
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines[lines.length - 1] ?? output.trim();
}

/**
 * Run a single benchmark task with a specific runner
 */
export async function runTask(
  task: GaiaTask,
  config: RunnerConfig,
): Promise<BenchmarkResult> {
  const startTime = Date.now();
  const { command, args } = buildRunnerCommand(config.runner, task, config);

  try {
    const result = await executeCommand(command, args, {
      env: config.env,
      cwd: config.cwd,
      timeout: config.timeout ?? DEFAULT_RUNNER_CONFIGS[config.runner].timeout,
    });

    const durationMs = Date.now() - startTime;
    const rawOutput = result.stdout;
    const answer = extractFinalAnswer(rawOutput);
    // If command failed (non-zero exit code), mark as incorrect
    const correct = result.exitCode === 0 && checkAnswer(answer, task.answer);

    return {
      taskId: task.id,
      question: task.question,
      level: task.level,
      files: task.files?.map((f) => f.name),
      answer,
      expectedAnswer: task.answer,
      correct,
      durationMs,
      rawOutput,
      error: result.exitCode !== 0 ? result.stderr : undefined,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    return {
      taskId: task.id,
      question: task.question,
      level: task.level,
      files: task.files?.map((f) => f.name),
      answer: "",
      expectedAnswer: task.answer,
      correct: false,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a runner is available on the system
 */
export async function isRunnerAvailable(runner: AgentRunner): Promise<boolean> {
  const command = DEFAULT_RUNNER_CONFIGS[runner].command!;

  try {
    const result = await executeCommand("which", [command], { timeout: 5000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get available runners on the system
 */
export async function getAvailableRunners(): Promise<AgentRunner[]> {
  const runners: AgentRunner[] = [
    "sandagent",
    "gemini-cli",
    "claudecode",
    "codex-cli",
  ];
  const available: AgentRunner[] = [];

  for (const runner of runners) {
    if (await isRunnerAvailable(runner)) {
      available.push(runner);
    }
  }

  return available;
}

/**
 * Create a runner configuration
 */
export function createRunnerConfig(
  runner: AgentRunner,
  overrides?: Partial<RunnerConfig>,
): RunnerConfig {
  return {
    runner,
    ...DEFAULT_RUNNER_CONFIGS[runner],
    ...overrides,
  };
}
