/**
 * Agent CLI Runners
 *
 * Executes benchmark tasks using various agent CLIs:
 * - sandagent: SandAgent CLI
 * - gemini-cli: Google Gemini CLI
 * - claudecode: Anthropic Claude Code CLI
 * - codex-cli: OpenAI Codex CLI
 *
 * Reference implementations:
 * - claude_code_agent.py: Uses -p --output-format json --dangerously-skip-permissions
 * - codex_agent.py: Uses exec --full-auto --output-last-message
 * - gemini_agent.py: Uses -p --output-format json
 */

import { spawn } from "node:child_process";
import { getRunner, getRunnerNames } from "./runners/index.js";
import type {
  AgentRunner,
  BenchmarkResult,
  GaiaTask,
  RunnerConfig,
} from "./types.js";

/**
 * Execute a command and capture output
 * Does NOT use shell: true to avoid escaping issues
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
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdin?.end();

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timeoutId = options.timeout
      ? setTimeout(() => {
          killed = true;
          proc.kill("SIGTERM");
          setTimeout(() => proc.kill("SIGKILL"), 1000);
        }, options.timeout)
      : null;

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (killed) {
        resolve({
          stdout,
          stderr:
            stderr + `\nProcess killed after timeout (${options.timeout}ms)`,
          exitCode: -1,
        });
      } else {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      }
    });

    proc.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
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

  if (normalizedAgent.length === 0) {
    return false;
  }

  if (normalizedAgent === normalizedExpected) {
    return true;
  }

  if (
    normalizedAgent.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedAgent)
  ) {
    return true;
  }

  return false;
}

/**
 * Detect API errors in output
 */
function detectApiError(output: string): string | undefined {
  const errorPatterns = [
    /API Error:[^\n]+/i,
    /Error:.*unauthorized/i,
    /Error:.*rate limit/i,
    /Error:.*quota exceeded/i,
    /violate.*Usage Policy/i,
    /Missing bearer or basic authentication/i,
    /401 Unauthorized/i,
    /ProjectIdRequiredError/i,
  ];

  for (const pattern of errorPatterns) {
    const match = output.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return undefined;
}

/**
 * Extract the final answer from agent output using the appropriate runner
 */
function extractFinalAnswer(output: string, runner: AgentRunner): string {
  const runnerHandler = getRunner(runner);

  // Try the specific runner's extractor first
  const answer = runnerHandler.extractAnswer(output);
  if (answer !== null) {
    return answer;
  }

  // Fallback: try all runners
  for (const name of getRunnerNames()) {
    if (name !== runner) {
      const otherRunner = getRunner(name);
      const otherAnswer = otherRunner.extractAnswer(output);
      if (otherAnswer !== null) {
        return otherAnswer;
      }
    }
  }

  // Ultimate fallback: return last non-empty line
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
  const runnerHandler = getRunner(config.runner);
  const { command, args } = runnerHandler.buildCommand(task, config);

  try {
    const result = await executeCommand(command, args, {
      env: config.env,
      cwd: config.cwd,
      timeout: config.timeout ?? runnerHandler.defaults.timeout,
    });

    const durationMs = Date.now() - startTime;
    const rawOutput = result.stdout;

    const apiError = detectApiError(rawOutput) || detectApiError(result.stderr);
    if (apiError) {
      return {
        taskId: task.id,
        question: task.question,
        level: task.level,
        files: task.files?.map((f) => f.name),
        answer: "",
        expectedAnswer: task.answer,
        correct: false,
        durationMs,
        rawOutput,
        error: apiError,
      };
    }

    const answer = extractFinalAnswer(rawOutput, config.runner);
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
  const runnerHandler = getRunner(runner);
  const command = runnerHandler.defaults.command;

  try {
    const result = await executeCommand("which", [command], { timeout: 5000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Ensure a runner is set up (e.g., logged in)
 */
export async function ensureRunnerSetup(runner: AgentRunner): Promise<boolean> {
  const runnerHandler = getRunner(runner);
  if (runnerHandler.setup) {
    return runnerHandler.setup();
  }
  return true;
}

/**
 * Ensure codex-cli is logged in with OPENAI_API_KEY
 * @deprecated Use ensureRunnerSetup('codex-cli') instead
 */
export async function ensureCodexLogin(): Promise<boolean> {
  return ensureRunnerSetup("codex-cli");
}

/**
 * Get available runners on the system
 */
export async function getAvailableRunners(): Promise<AgentRunner[]> {
  const available: AgentRunner[] = [];

  for (const name of getRunnerNames()) {
    if (await isRunnerAvailable(name)) {
      available.push(name);
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
  const runnerHandler = getRunner(runner);
  return {
    runner,
    command: runnerHandler.defaults.command,
    args: runnerHandler.defaults.args,
    timeout: runnerHandler.defaults.timeout,
    ...overrides,
  };
}
