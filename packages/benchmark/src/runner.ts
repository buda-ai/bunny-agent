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
import {
  buildReflectionPrompt,
  extractCommandFromOutput,
  shouldTriggerReflection,
} from "./reflection-helper.js";
import { getRunner, getRunnerNames } from "./runners/index.js";
import type { AgentRunner, BenchmarkResult, GaiaTask } from "./types.js";

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
 * Run a single benchmark task with a specific runner
 */
export async function runTask(
  task: GaiaTask,
  runner: AgentRunner,
): Promise<BenchmarkResult> {
  const startTime = Date.now();
  const runnerHandler = getRunner(runner);
  const { command, args } = runnerHandler.buildCommand(task);

  try {
    const result = await executeCommand(command, args, {
      timeout: runnerHandler.defaults.timeout,
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

    const answer = runnerHandler.extractAnswer(rawOutput);
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
 * Run task with reflection loop
 * Executes CLI runner multiple times with reflection prompts injected between iterations
 */
export async function runTaskWithReflection(
  task: GaiaTask,
  runner: AgentRunner,
  options: {
    verbose?: boolean;
    maxReflections?: number;
  } = {},
): Promise<BenchmarkResult> {
  const startTime = Date.now();
  const maxReflections = options.maxReflections ?? 15;
  const verbose = options.verbose ?? false;

  let stepCount = 0;
  let currentQuestion = task.question;
  const commandHistory: string[] = [];
  let lastResult: BenchmarkResult | null = null;

  if (verbose) {
    console.log(
      `\n🤖 Starting reflection loop (max ${maxReflections} iterations)...`,
    );
  }

  // Reflection loop
  while (stepCount < maxReflections) {
    stepCount++;

    if (verbose) {
      console.log(`\n--- Reflection Step ${stepCount}/${maxReflections} ---`);
      if (stepCount > 1) {
        console.log(
          `Question with reflection: ${currentQuestion.substring(0, 100)}...`,
        );
      }
    }

    // Run task with current question
    const modifiedTask = { ...task, question: currentQuestion };
    const result = await runTask(modifiedTask, runner);
    lastResult = result;

    // Track commands used (extract from output if possible)
    if (result.rawOutput) {
      const cmd = extractCommandFromOutput(result.rawOutput);
      if (cmd) {
        commandHistory.push(cmd);
      }
    }

    // Check if we should trigger reflection
    const shouldReflect = shouldTriggerReflection({
      stepCount,
      maxSteps: maxReflections,
      lastCommand: commandHistory[commandHistory.length - 1],
      commandHistory,
      hasError: !!result.error,
    });

    if (verbose) {
      console.log(`Answer: ${result.answer}`);
      console.log(`Should reflect: ${shouldReflect}`);
      console.log(`Commands used so far: ${commandHistory.join(", ")}`);
    }

    if (!shouldReflect) {
      if (verbose) {
        console.log(
          "\n✅ Final answer detected or max reflections reached. Stopping reflection loop.",
        );
      }
      break;
    }

    // Build reflection prompt for next iteration
    const reflectionPrompt = buildReflectionPrompt({
      stepNumber: stepCount,
      totalSteps: maxReflections,
      lastCommand: commandHistory[commandHistory.length - 1],
      hasError: !!result.error,
      isRepeating:
        commandHistory.length >= 3 &&
        commandHistory
          .slice(-3)
          .every((cmd) => cmd === commandHistory[commandHistory.length - 1]),
    });

    if (verbose) {
      console.log(
        `\n💭 Reflection prompt: ${reflectionPrompt.substring(0, 200)}...`,
      );
    }

    // Update question for next iteration
    currentQuestion = `${task.question}\n\n${reflectionPrompt}\n\nPrevious answer: ${result.answer}`;
  }

  if (verbose && stepCount >= maxReflections) {
    console.log(
      `\n⚠️ Reached maximum reflections (${maxReflections}). Using last answer.`,
    );
  }

  // Return the last result with updated step count
  if (lastResult) {
    return {
      ...lastResult,
      durationMs: Date.now() - startTime,
    };
  }

  // Fallback if no result
  return {
    taskId: task.id,
    question: task.question,
    level: task.level,
    answer: "",
    expectedAnswer: task.answer,
    correct: false,
    durationMs: Date.now() - startTime,
  };
}
